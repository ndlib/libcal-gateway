const fetch = require('node-fetch')
const { getToken, requestHeaders } = require('./shared/helpers')
const { successResponse } = require('./shared/response')
const { sentryWrapper } = require('./shared/sentryWrapper')

module.exports.handler = sentryWrapper(async (event, context, callback) => {
  const token = await getToken()

  const url = `${process.env.LIBCAL_API_URL}/space/locations`
  const response = await fetch(url, { headers: requestHeaders(token) }).then(async res => ({
    statusCode: res.status,
    data: res.ok ? await res.json() : null,
  }))

  return successResponse(callback, response.data, response.statusCode)
})
