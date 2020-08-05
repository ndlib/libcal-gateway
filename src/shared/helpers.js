const fetch = require('node-fetch')

module.exports.requestHeaders = token => ({
  'Content-Type': 'application/json',
  Authorization: token ? `Bearer ${token}` : undefined,
})

module.exports.getToken = async () => {
  const url = `${process.env.LIBCAL_API_URL}/oauth/token`
  const body = {
    client_id: process.env.API_CLIENT_ID,
    client_secret: process.env.API_CLIENT_SECRET,
    grant_type: 'client_credentials',
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: exports.requestHeaders(),
    body: JSON.stringify(body),
  }).then(res => res.json())
  return response.access_token
}

// Format js Date to string with format YYYY-MM-DD
module.exports.dateToYMD = date => {
  const offset = date.getTimezoneOffset() * 60 * 1000
  const newDate = new Date(date.getTime() - offset)
  return newDate.toISOString().split('T')[0]
}
