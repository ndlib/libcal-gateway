const nock = require('nock')

module.exports.defaultNetId = 'test123'
module.exports.fakeToken = 'abcd8f1'

module.exports.mockTokenFetch = () => {
  return nock(process.env.LIBCAL_API_URL)
    .post('/oauth/token')
    .optionally()
    .reply(200, JSON.stringify(exports.fakeToken))
}

module.exports.getEvent = (pathParams, queryParams, body, netid) => {
  // Allow passing null to explicitly set netid to null; undefined will use defaultNetId
  if (!netid && netid !== null) {
    netid = exports.defaultNetId
  }
  return {
    requestContext: {
      authorizer: {
        netid: netid,
        email: netid ? `${netid}@test.email` : undefined,
      },
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    pathParameters: pathParams || {},
    queryStringParameters: queryParams || {},
  }
}