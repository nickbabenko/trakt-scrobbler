
const express = require('express')
const bodyParser = require('body-parser')
const Trakt = require('trakt.tv')
const multipart = require('connect-multiparty')

const app = express()
const port = process.env.PORT || 3000

const app_version = '1.0'
const app_date = '09-09-20'

const trakt = new Trakt({
  client_id: process.env.TRAKT_CLIENT_ID,
  client_secret: process.env.TRAKT_CLIENT_SECRET,
  redirect_uri: process.env.TRAKT_REDIRECT_URI,
})

app.use(bodyParser.urlencoded({ extended: true }))
app.use(multipart())

app.post('/', async (req, res) => {
  try {
    await trakt.import_token({
      access_token: process.env.TRAKT_TOKEN,
      expires: parseInt(process.env.TRAKT_TOKEN_EXPIRES),
      refresh_token: process.env.TRAKT_REFRESH_TOKEN,
    })
  } catch (e) {
    console.error(`Failed to authenticate with Trakt - ${e}`)
    return
  }

  let payload
  try {
    payload = JSON.parse(req.body.payload)
  } catch (e) {
    res.sendStatus(400)
    return
  }

  if (payload.Account.title == process.env.ACCOUNT && ['movie', 'episode'].includes(payload.Metadata.type)) {
    let media
    try {
      const [ _, tvdbId, seasonNumber, episodeNumber ] = payload.Metadata.guid.match(/:\/\/(\d*)\/(\d*)\/(\d*)/)

      console.log(tvdbId, seasonNumber, episodeNumber)

      media = (await trakt.search.id({
        id_type: 'tvdb',
        id: tvdbId,
        type: payload.Metadata.type === 'episode' ? 'show' : 'movie',
      }))[0]

      if (payload.Metadata.type === 'episode') {
        media = (await trakt.seasons.summary({
          id: media.show.ids.trakt,
          extended: 'episodes,full',
        }))
        media = media
          .find(season => season.number === parseInt(seasonNumber))
          .episodes
          .find(episode => episode.number === parseInt(episodeNumber))
      }
    } catch (e) {
      console.error(`Failed to match - GUID: ${payload.Metadata.guid} - ${e}`)
      res.sendStatus(400)
      return
    }

    const progress = media?.runtime && payload?.Metadata?.viewOffset
      ? Math.round((Math.round(payload.Metadata.viewOffset / 1000 / 60) / media.runtime) * 100)
      : 0

    try {
      switch (payload.event) {
        case 'media.play':
        case 'media.resume':
          await trakt.scrobble.start({
            app_version,
            app_date,
            [payload.Metadata.type]: media,
            progress,
          })
          break
        case 'media.pause':
          await trakt.scrobble.pause({
            app_version,
            app_date,
            [payload.Metadata.type]: media,
            progress,
          })
          break
        case 'media.scrobble':
          await trakt.scrobble.stop({
            app_version,
            app_date,
            [payload.Metadata.type]: media,
            progress,
          })
          break
      }
      res.sendStatus(200)
      return
    } catch (e) {
      console.error(`Failed to update scrobble status - GUID: ${payload.Metadata.guid} - ${e}`)
      res.sendStatus(400)
    }
  }
})

app.listen(port, () => {
  console.log(`Trakt scrobbler listening at http://localhost:${port}`)
})
