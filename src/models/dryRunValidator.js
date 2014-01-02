'use strict';

var utils = require('util'),
    Q = require('q'),
    exceptions = require('../errors/errors'),
    combinators = require('../util/combinators');

function create (StubRepository, testRequest, allowInjection, additionalValidation) {

    var dryRunProxy = { to: function () { return Q({}); } },
        noOp = function () {},
        dryRunLogger = { debug: noOp, info: noOp, warn: noOp, error: noOp },
        identity = function (obj) { return obj; };

    function dryRun (stub) {
        var stubRepository = StubRepository.create(dryRunProxy, identity),
            clone = combinators.clone(stub); // proxyOnce changes state

        stubRepository.addStub(clone);
        return stubRepository.resolve(testRequest, dryRunLogger);
    }

    function addDryRunErrors (stub, errors) {
        var deferred = Q.defer();

        try {
            dryRun(stub).done(deferred.resolve, function (reason) {
                reason.source = reason.source || JSON.stringify(stub);
                errors.push(reason);
                deferred.resolve();
            });
        }
        catch (error) {
            errors.push(exceptions.ValidationError('malformed stub request', {
                data: error.message,
                source: error.source || stub
            }));
            deferred.resolve();
        }

        return deferred.promise;
    }

    function hasInjection (stub) {
        var hasResponseInjections = utils.isArray(stub.responses) && stub.responses.some(function (response) {
                return response.inject;
            }),
            hasPredicateInjections = Object.keys(stub.predicates || {}).some(function (predicate) {
                return stub.predicates[predicate].inject;
            });
        return hasResponseInjections || hasPredicateInjections;
    }

    function addInjectionErrors (stub, errors) {
        if (!allowInjection && hasInjection(stub)) {
            errors.push(exceptions.InjectionError({ source: stub }));
        }
    }

    function errorsFor (stub) {
        var errors = [],
            deferred = Q.defer();

        if (!utils.isArray(stub.responses) || stub.responses.length === 0) {
            errors.push(exceptions.ValidationError("'responses' must be a non-empty array", {
                source: stub
            }));
        }
        addInjectionErrors(stub, errors);

        if (errors.length > 0) {
            // no sense in dry-running if there are already problems;
            // it will just add noise to the errors
            deferred.resolve(errors);
        }
        else {
            addDryRunErrors(stub, errors).done(function () {
                deferred.resolve(errors);
            });
        }

        return deferred.promise;
    }

    function validate (request) {
        var stubs = request.stubs || [],
            validationPromises = stubs.map(errorsFor),
            deferred = Q.defer();

        if (additionalValidation) {
            validationPromises.push(Q(additionalValidation(request)));
        }

        Q.all(validationPromises).done(function (errorsForAllStubs) {
            var allErrors = errorsForAllStubs.reduce(function (stubErrors, accumulator) {
                return accumulator.concat(stubErrors);
            }, []);
            deferred.resolve({ isValid: allErrors.length === 0, errors: allErrors });
        });

        return deferred.promise;
    }

    return {
        validate: validate
    };
}

module.exports = {
    create: create
};
