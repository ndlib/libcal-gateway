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

module.exports.getTimeString = (timeString) => {
  let timeArray = timeString.split(':')
  timeArray = timeArray.map((t) => {
    return parseInt(t)
  })

  if (timeArray[0] === 12) {
    timeArray[0] = 0
  }
  if (timeString.toLowerCase().includes('pm')) {
    timeArray[0] += 12
  }

  timeArray = timeArray.map((num) => {
    if (num < 10) {
      num = '0' + num
    }
    return num
  })

  if (!timeArray[1]) {
    timeArray[1] = '00'
  }

  if (!timeArray[2]) {
    timeArray[2] = '00'
  }

  return 'T' + timeArray[0] + ':' + timeArray[1] + ':' + timeArray[2]
}

module.exports.stripHtml = (data) => {
  // The full match for this is the entire opening tag, closing tag, and content in between.
  // Group 1 = tag name (ex: "a", "br", "div")
  // Group 2 = properties string to keep (ex: " href='something.com'") May be undefined.
  // Group 3 = content inside tag. Will be undefined if self-closing tag.
  const htmlRegex = /<(.+?)(?:(?:(?=\shref=")|\s[\s\S]*?)(?:(\shref=".*?")[\s\S]*?)?(?=\/?>)|(?=\/?>))(?:\/>|>([\s\S]*?)<\/.*?>)/g
  return data.replace(htmlRegex, '<$1$2>$3</$1>')
}
