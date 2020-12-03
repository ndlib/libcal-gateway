const fetch = require('node-fetch')
const { t: typy } = require('typy')
const moment = require('moment-timezone')
const { successResponse } = require('./shared/response')
const { sentryWrapper } = require('./shared/sentryWrapper')
const { getTimeString } = require('./shared/helpers')

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

module.exports.handler = sentryWrapper(async (event, context, callback) => {
  const url = process.env.LIBCAL_HOURS_WIDGET_URL
  return fetch(url)
    .then(res => res.json())
    .then(json => mapHours(json))
    .then(mappedHours => successResponse(callback, mappedHours))
})

const mapHours = (inHours) => {
  const output = {
    locations: {},
  }

  typy(inHours, 'locations').safeArray.forEach((location) => {
    // Add timezone info
    const tz = moment.tz(getTimezoneFromLocation(location))
    location.timezone = tz.format('z')
    location.timezoneOffset = tz.format('Z')

    location.weeks = mapWeeks(location)

    // remap the location by key
    output.locations[location.lid] = location
  })

  return output
}

const getTimezoneFromLocation = (location) => {
  // Map location ids to a different timezone (besides the ones on the default timezone)
  const timezoneMap = {
    6088: 'Europe/London',
  }
  return timezoneMap[location.lid] || process.env.LIBCAL_TIMEZONE || 'America/Indiana/Indianapolis'
}

const mapWeeks = (location) => {
  const timezone = getTimezoneFromLocation(location)
  return location.weeks.map((week, index) => {
    const currentWeek = week
    const prevWeek = location.weeks[index - 1]
    const nextWeek = location.weeks[index + 1]

    weekdays.map((key, weekIndex) => {
      const nextDayStatus = getNextDayStatus(week, nextWeek, weekIndex)
      const prevDayStatus = getPrevDayStatus(week, prevWeek, weekIndex)

      let day = typy(currentWeek, key).safeObjectOrEmpty
      day = exports.addLocalHours(timezone, day, nextDayStatus, prevDayStatus)
      day.rendered = typy(day, 'rendered').safeString.replace(/-/g, '–').replace(/[.]/g, ',')
      currentWeek[key] = day
    })

    return currentWeek
  })
}

module.exports.addLocalHours = (timezone, day, nextDayStatus, prevDayStatus) => {
  const status = typy(day, 'times.status').safeString
  if (status === 'open') {
    day.times.hours = day.times.hours.map((hours) => {
      hours.fromLocalDate = moment.tz(day.date + getTimeString(hours.from), timezone)
      if (hours.to === '') {
        hours.toLocalDate = moment.tz(day.date + 'T23:59:59', timezone)
      } else {
        hours.toLocalDate = moment.tz(day.date + getTimeString(hours.to), timezone)
      }

      // if the to date is less than the from date assume this is an error and it should be 24 hours in the future
      if (hours.toLocalDate < hours.fromLocalDate) {
        // numbers greater than 24 bubble up to the next day http://momentjs.com/docs/#/get-set/hour/
        hours.toLocalDate.hours(hours.toLocalDate.hours() + 24)
      }

      hours.fromLocalDate = hours.fromLocalDate.format()
      hours.toLocalDate = hours.toLocalDate.format()

      return hours
    })

    if (day.times.hours && day.times.hours[day.times.hours.length - 1].from === '12am' && prevDayStatus === '24hours') {
      day.rendered = 'Closes at ' + day.times.hours[day.times.hours.length - 1].to
    }
    if (day.times.hours && day.times.hours[0].to === '12am' && nextDayStatus === '24hours') {
      day.rendered = 'Opens at ' + day.times.hours[0].from
    }
  } else if (status === '24hours') {
    day.rendered = 'Open 24 Hours'

    day.times.hours = [{
      fromLocalDate: moment.tz(day.date + 'T00:00:00', timezone).format(),
      toLocalDate: moment.tz(day.date + 'T23:59:59', timezone).format(),
    }]
  }
  return day
}

const getNextDayStatus = (week, nextWeek, weekIndex) => {
  let nextDay = false

  if (weekIndex === 6) {
    nextDay = (nextWeek !== undefined) ? nextWeek[weekdays[0]] : false
  } else {
    nextDay = week[weekdays[weekIndex + 1]]
  }

  return (nextDay) ? (typy(nextDay, 'times.status').safeString || 'NoDayPresent') : 'NoDayPresent'
}

const getPrevDayStatus = (week, prevWeek, weekIndex) => {
  let prevDay = false

  if (weekIndex === 0) {
    prevDay = (prevWeek !== undefined) ? prevWeek[weekdays[6]] : false
  } else {
    prevDay = week[weekdays[weekIndex - 1]]
  }

  return (prevDay) ? (typy(prevDay, 'times.status').safeString || 'NoDayPresent') : 'NoDayPresent'
}
