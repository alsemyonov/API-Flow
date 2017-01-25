import { List } from 'immutable'
import { DynamicValue, DynamicString, RecordParameter } from '../../mocks/PawShims'

import Store from '../../models/Store'
import Auth from '../../models/Auth'
import Reference from '../../models/Reference'

import { currify } from '../../utils/fp-utils'

const __inputs__ = []

const methods = {}

export class PawSerializer {
  static fileExtensions = [];

  static inputs = __inputs__

  serialize(api, options) {
    return methods.serialize(api, options)
  }
}

/**
 * wraps a DynamicValue in a DynamicString
 * @param {DynamicValue} dv: the dv to wrapDV
 * @returns {DynamicString} the corresponding DynamicString
 */
methods.wrapDV = (dv) => new DynamicString(dv)

/**
 * creates a JSON DynamicValue to wrap a JSON object.
 * @param {Object} json: the json object to wrap in a DV
 * @returns {DynamicValue} the corresponding JSON DynamicValue
 */
methods.createJSONDV = (json) => new DynamicValue('com.luckymarmot.JSONDynamicValue', {
  json: JSON.stringify(json)
})

/**
 * extracts the title from an Api Record.
 * @param {Api} api: the api to get the name of.
 * @returns {string} the title of the api, or a default value if the api does not have any title
 */
methods.getTitleFromApi = (api) => api.getIn([ 'info', 'title' ]) || 'Imports'

/**
 * creates a standard environment domain in which to store standard values, such as shared schemas,
 * parameters, endpoints and authentication methods.
 * @param {Context} context: the paw context in which to create the environment domain.
 * @param {Api} api: the api to import in Paw.
 * @returns {EnvironmentDomain} the newly created environment domain
 */
methods.createStandardEnvironmentDomain = (context, api) => {
  const title = methods.getTitleFromApi(api)
  return context.createEnvironmentDomain(title)
}

// assumes correctly formatted api
/**
 * calculates the size of the standard environment domain. This is used to determine whether we
 * should create a domain or not.
 * @param {Api} api: the api to import in Paw.
 * @returns {integer} the number of values that would be stored in the environment domain.
 */
methods.getStandardEnvironmentDomainSize = (api) => {
  const constraints = api.getIn([ 'store', 'constraint' ])
  const endpoints = api.getIn([ 'store', 'endpoint' ])
  const auths = api.getIn([ 'store', 'auth' ])
  const parameters = api.getIn([ 'store', 'parameter' ])
  // const responses = api.getIn([ 'store', 'response' ])

  const size = constraints.size +
    endpoints.size +
    auths.size +
    parameters.size
    // +
    // responses.size

  return size
}

/**
 * tests whether an Api needs a standard environment domain to be fully imported in Paw
 * @param {Api} api: the api to import in Paw
 * @returns {boolean} whether a standard environment domain is needed.
 */
methods.needsStandardEnvironmentDomain = (api) => {
  const size = methods.getStandardEnvironmentDomainSize(api)

  return size > 0
}

/**
 * creates a Variable environment domain. This is used to import Variables with multiple contexts
 * into Paw.
 * @param {Context} context: the Paw context in which to create the environment domain
 * @param {Api} api: the api to import in Paw.
 * @returns {EnvironmentDomain} the newly created environment domain.
 *
 * NOTE: It needs to be separate from the standard domain because values imported in the standard
 * domain only have a single value possible, whereas variables can have multiple values whose
 * evaluation depend on the name of the context (Think switching between Postman Environments)
 */
methods.createVariableEnvironmentDomain = (context, api) => {
  const title = methods.getTitleFromApi(api)
  const domainName = 'Vars - ' + title
  return context.createEnvironmentDomain(domainName)
}

/**
 * adds a Constraint as JSON DV to a domain.
 * @param {EnvironmentDomain} domain: the domain to add the constraint to.
 * @param {Environment} environment: the domain environment for which this value is applicable.
 * @param {Constraint} constraint: the constraint to add.
 * @param {string} key: the name of the constraint
 * @returns {EnvironmentVariable} the newly created environment variable
 */
methods.addConstraintToDomain = (domain, environment, constraint, key) => {
  const variable = domain.createEnvironmentVariable(key)
  const schema = constraint.toJSONSchema()
  const dv = methods.createJSONDV(schema)
  const ds = methods.wrapDV(dv)
  variable.setValue(ds, environment)

  return variable
}

/**
 * adds all constraints of a Constraint TypedStore into a domain.
 * @param {EnvironmentDomain} domain: the domain to add the constraints to.
 * @param {Environment} environment: the domain environment for which the constraints are
 * applicable.
 * @param {Api} api: the api to get the TypedStore from.
 * @returns {TypedStore}: a TypedStore of EnvironmentVariables representing constraints.
 */
methods.addConstraintsToDomain = (domain, environment, api) => {
  const constraints = api.getIn([ 'store', 'constraint' ])
  const addConstraint = currify(methods.addConstraintToDomain, domain, environment)

  return constraints.map(addConstraint)
}

/**
 * removes ':' at the end of a protocol string
 * @param {string} protocol: the protocol to trim
 * @returns {string} the trimmed string
 */
methods.removeDotsFromProtocol = (protocol) => {
  if (protocol[protocol.length - 1] === ':') {
    return protocol.slice(0, protocol.length - 1)
  }

  return protocol
}

/**
 * converts a protocol string into a Record Parameter.
 * @param {string} protocol: the protocol to convert
 * @param {integer} index: the index of the protocol in the parent array. This is used to set the
 * first Record Parameter as enabled
 * @return {RecordParameter} the corresponding Record Parameter.
 */
methods.convertProtocolIntoRecordParameter = (protocol, index) => {
  const stripped = methods.removeDotsFromProtocol(protocol)
  const isEnabled = index === 0
  return new RecordParameter(stripped, ', ', isEnabled)
}

/**
 * converts a protocol URLComponent into a DynamicValue.
 * @param {URLComponent} protocol: the url component to convert
 * @returns {DynamicValue} the corresponding DynamicValue.
 */
methods.createProtocolDV = (protocol) => {
  if (!protocol || !protocol.size) {
    return 'http'
  }

  if (protocol.size === 1) {
    return methods.removeDotsFromProtocol(protocol.get(0))
  }

  return new DynamicValue('me.elliotchance.MultiSelectorDynamicValue', {
    choices: protocol.map(methods.convertProtocolIntoRecordParameter).toJS(),
    separator: ','
  })
}

// TODO save parameters as document parameters when these finally exist in Paw
/**
 * converts a urlComponent into a DynamicString or a standard string as a fallback.
 * @param {URLComponent} urlComponent: the urlComponent to convert
 * @return {string|DynamicString} the converted value
 */
methods.convertURLComponentToDynamicString = (urlComponent) => {
  if (!urlComponent) {
    return ''
  }

  return urlComponent.generate(List([ '{', '}' ]))
}

/**
 * converts an endpoint into a DynamicString.
 * @param {URL} endpoint: the endpoint to convert
 * @returns {DynamicString} the corresponding DynamicString
 */
methods.createEndpointDynamicString = (endpoint) => {
  const protocol = methods.createProtocolDV(endpoint.get('protocol'))
  const slashes = '://'
  const hostname = methods.convertURLComponentToDynamicString(endpoint.get('hostname'))
  const port = methods.convertURLComponentToDynamicString(endpoint.get('port'))
  const portDots = port ? ':' : ''
  const pathname = methods.convertURLComponentToDynamicString(endpoint.get('pathname'))

  return new DynamicString(protocol, slashes, hostname, portDots, port, pathname)
}

/**
 * adds an endpoint to a domain, as DynamicStrings
 * @param {EnvironmentDomain} domain: the domain to add the endpoint to.
 * @param {Environment} environment: the environment in which this endpoint value is applicable.
 * @param {URL} endpoint: the endpoint to add to the domain
 * @param {string} key: the name of the endpoint
 * @returns {EnvironmentVariable} the newly created environment variable.
 */
methods.addEndpointToDomain = (domain, environment, endpoint, key) => {
  const variable = domain.createEnvironmentVariable(key)
  const ds = methods.createEndpointDynamicString(endpoint)
  variable.setValue(ds, environment)

  return variable
}

/**
 * adds all endpoints from an Endpoint TypedStore to a domain.
 * @param {EnvironmentDomain} domain: the domain to add the endpoints to.
 * @param {Environment} environment: the environment in which these endpoints are applicable.
 * @param {Api} api: the api from which to get the Endpoint TypedStore.
 * @returns {TypedStore} a TypedStore of EnvironmentVariables representing endpoints.
 */
methods.addEndpointsToDomain = (domain, environment, api) => {
  const endpoints = api.getIn([ 'store', 'endpoint' ])
  const addEndpoint = currify(methods.addEndpointToDomain, domain, environment)

  return endpoints.map(addEndpoint)
}

/**
 * adds a Parameter to a domain, as a DynamicString
 * @param {EnvironmentDomain} domain: the domain to add the parameter to.
 * @param {Environment} environment: the environment in which this parameter value is applicable.
 * @param {Parameter} parameter: the parameter to add to the domain
 * @param {string} key: the name of the endpoint
 * @returns {EnvironmentVariable} the newly created environment variable.
 */
methods.addParameterToDomain = (domain, environment, parameter, key) => {
  const variable = domain.createEnvironmentVariable(key)
  const schema = parameter.getJSONSchema(false)
  const dv = methods.createJSONDV(schema)
  const ds = methods.wrapDV(dv)
  variable.setValue(ds, environment)

  return variable
}

/**
 * adds all parameters from a Parameter TypedStore to a domain.
 * @param {EnvironmentDomain} domain: the domain to add the parameters to.
 * @param {Environment} environment: the environment in which these parameters are applicable.
 * @param {Api} api: the api from which to get the Parameter TypedStore.
 * @returns {TypedStore} a TypedStore of EnvironmentVariables representing parameters.
 */
methods.addParametersToDomain = (domain, environment, api) => {
  const parameters = api.getIn([ 'store', 'parameter' ])
  const addParameter = currify(methods.addParameterToDomain, domain, environment)

  return parameters.map(addParameter)
}

/**
 * converts a BasicAuth into its corresponding DynamicValue
 * @param {Auth} auth: the basic auth to convert
 * @returns {DynamicValue} the corresponding DynamicValue
 */
methods.convertBasicAuthIntoDynamicValue = (auth) => {
  return new DynamicValue('com.luckymarmot.BasicAuthDynamicValue', {
    username: auth.get('username') || '',
    password: auth.get('password') || ''
  })
}

/**
 * converts an auth in its corresponding DynamicValue depending on the type of the auth.
 * @param {Auth} auth: the auth to convert
 * @returns {DynamicValue|''} the corresponding DynamicValue, or an empty string if there are no
 * equivalent for this auth in Paw.
 */
methods.convertAuthIntoDynamicValue = (auth) => {
  if (auth instanceof Auth.Basic) {
    return methods.convertBasicAuthIntoDynamicValue(auth)
  }

  return ''
}

/**
 * adds an Auth to a domain, as a DynamicString
 * @param {EnvironmentDomain} domain: the domain to add the auth to.
 * @param {Environment} environment: the environment in which this auth value is applicable.
 * @param {Auth} auth: the auth to add to the domain
 * @param {string} key: the name of the auth
 * @returns {EnvironmentVariable} the newly created environment variable.
 */
methods.addAuthToDomain = (domain, environment, auth, key) => {
  const variable = domain.createEnvironmentVariable(key)
  const dv = methods.convertAuthIntoDynamicValue(auth)
  const ds = methods.wrapDV(dv)
  variable.setValue(ds, environment)

  return variable
}

/**
 * adds all auths from an Auth TypedStore to a domain.
 * @param {EnvironmentDomain} domain: the domain to add the auths to.
 * @param {Environment} environment: the environment in which these auths are applicable.
 * @param {Api} api: the api from which to get the Auth TypedStore.
 * @returns {TypedStore} a TypedStore of EnvironmentVariables representing auths.
 */
methods.addAuthsToDomain = (domain, environment, api) => {
  const auths = api.getIn([ 'store', 'auth' ])
  const addAuth = currify(methods.addAuthToDomain, domain, environment)

  return auths.map(addAuth)
}


methods.addVariablesToStandardDomain = (context, domain, api) => {
  const environment = domain.createEnvironment('Default')

  const constraint = methods.addConstraintsToDomain(domain, environment, api)
  const endpoint = methods.addEndpointsToDomain(domain, environment, api)
  const parameter = methods.addParametersToDomain(domain, environment, api)
  const auth = methods.addAuthsToDomain(domain, environment, api)

  return new Store({ constraint, endpoint, parameter, auth })
}

methods.getVariableEnvironmentDomainSize = (api) => api.getIn([ 'store', 'variable' ]).size

methods.needsVariableEnvironmentDomain = (api) => {
  const size = methods.getVariableEnvironmentDomainSize(api)

  return size
}

methods.updateEnvironmentVariableWithEnvironmentValue = (domain, variable, value, envName) => {
  let environment = domain.getEnvironmentByName(envName)
  if (!environment) {
    environment = domain.createEnvironment(envName)
  }
  variable.setValue(value, environment)
  return variable
}

methods.convertVariableIntoEnvironmentVariable = (domain, variable, key) => {
  const envVariable = domain.createEnvironmentVariable(key)
  const updateVariable = currify(methods.updateEnvironmentVariableWithEnvironmentValue, domain)
  return variable.get('values').reduce(updateVariable, envVariable)
}

methods.addVariablesToVariableDomain = (context, domain, api) => {
  const convertVariable = currify(methods.convertVariableIntoEnvironmentVariable, domain)
  const vars = api.getIn([ 'store', 'variable' ]).map(convertVariable)

  return new Store({
    variable: vars
  })
}

methods.createEnvironments = (context, api) => {
  let store = new Store()
  if (methods.needsStandardEnvironmentDomain(api)) {
    const domain = methods.createStandardEnvironmentDomain(context, api)
    store = methods.addVariablesToStandardDomain(context, domain, api)
  }

  if (methods.needsVariableEnvironmentDomain(api)) {
    const domain = methods.createVariableEnvironmentDomain(context, api)
    const variableStore = methods.addVariablesToVariableDomain(context, domain, api)
    store = store.set('variable', variableStore.get('variable'))
  }

  return store
}

// TODO deal with case where there's an overlay for the url
methods.convertEndpointsAndPathnameIntoDS = (pawRequest, store, endpoints, pathname) => {
  const converted = endpoints.map((endpoint) => {
    if (endpoint instanceof Reference) {
      const variable = store.getIn([ 'endpoint', endpoint.get('uuid') ])
      if (variable) {
        return variable.createDynamicString()
      }
      return null
    }

    return methods.createEndpointDynamicString(endpoint)
  }).filter(value => !!value)
    .valueSeq()
    .toJS()

  if (converted.length === 1) {
    return new DynamicString(converted[0], pathname)
  }

  const dv = pawRequest.addVariable('endpoint', converted[0], 'the endpoint of this url')
  dv.schema = JSON.stringify({ type: 'string', enum: converted })

  return new DynamicString(dv, pathname)
}

methods.convertRequestIntoPawRequest = (context, store, path, request) => {
  const pathname = path.toURLObject(List([ '{', '}' ])).pathname
  const name = request.get('name') || pathname
  const method = request.get('method').toUpperCase()
  const endpoints = request.get('endpoints')
  const description = request.get('description') || ''

  const pawRequest = context.createRequest(name, method, new DynamicString(), description)
  const url = methods.convertEndpointsAndPathnameIntoDS(pawRequest, store, endpoints, pathname)
  pawRequest.url = url
  return pawRequest
}

// NOTE: not sure this is the best idea
methods.convertResourceIntoGroup = (context, store, resource) => {
  const path = resource.get('path')

  const group = context.createRequestGroup(resource.get('name') || 'resource-group')

  const convertRequest = currify(
    methods.convertRequestIntoPawRequest,
    context, store, path
  )

  return resource.get('methods')
    .map(convertRequest)
    .reduce(($group, pawRequest) => {
      $group.appendChild(pawRequest)
      return $group
    }, group)
}

methods.createRequests = (context, store, api) => {
  const convertResource = currify(methods.convertResourceIntoGroup, context, store)
  const resources = api.get('resources').map(convertResource)

  return resources
}

methods.serialize = ({ context, items, options } = {}, api) => {
  const store = methods.createEnvironments(context, api)
  const resources = methods.createRequests(context, store, api)
  return true
}

export const __internals__ = methods
export default PawSerializer
