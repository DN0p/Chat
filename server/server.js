/* eslint-disable no-param-reassign */
/* eslint-disable no-undef */
import express from 'express'
import path from 'path'
import cors from 'cors'
import bodyParser from 'body-parser'
import http from 'http'
import socketServer from 'socket.io'
import { renderToStaticNodeStream } from 'react-dom/server'
import React from 'react'

import cookieParser from 'cookie-parser'
import passport from 'passport'
import jwt from 'jsonwebtoken'
import config from './config'
import connectDatabase from './services/mongoose'
import passportJWT from './services/passport'
import User from './model/User.model'
import Html from '../client/html'

const Root = () => ''

try {
  // eslint-disable-next-line import/no-unresolved
  // ;(async () => {
  //   const items = await import('../dist/assets/js/root.bundle')
  //   console.log(JSON.stringify(items))

  //   Root = (props) => <items.Root {...props} />
  //   console.log(JSON.stringify(items.Root))
  // })()
  console.log(Root)
} catch (ex) {
  console.log(' run yarn build:prod to enable ssr')
}

const connections = []

connectDatabase()

const port = process.env.PORT || 8090
const server = express()
const serve = http.createServer(server)
const io = socketServer(serve)

const middleware = [
  cors({
    origin: 'http://localhost:8087/'
  }),
  passport.initialize(),
  express.static(path.resolve(__dirname, '../dist/assets')),
  bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 50000 }),
  bodyParser.json({ limit: '50mb', extended: true }),
  cookieParser()
]

middleware.forEach((it) => server.use(it))

passport.use('jwt', passportJWT)

function createToken(user) {
  const payload = { uid: user.id }
  const token = jwt.sign(payload, config.secret, { expiresIn: '48h' })
  delete user.password
  return token
}

async function getTokenAndUser(data) {
  const user = await User.findAndValidateUser(data)
  const token = createToken(user)
  return { token, user }
}

function createCookie(token, res) {
  return res.cookie('token', token, { maxAge: 1000 * 60 * 60 * 48 })
}

server.get('/api/v1/auth', async (req, res) => {
  try {
    const jwtUser = jwt.verify(req.cookies.token, config.secret)
    const user = await User.findById(jwtUser.uid)
    const token = createToken(user)
    createCookie(token, res)
    res.json({ status: 'ok', token, user })
  } catch (err) {
    res.json({ status: 'error', err })
  }
})

server.post('/api/v1/auth', async (req, res) => {
  try {
    const { token, user } = await getTokenAndUser(req.body)
    createCookie(token, res)
    res.json({ status: 'ok', token, user })
  } catch (err) {
    res.json({ status: 'error', message: `auth error ${err}` })
  }
})

server.post('/api/v1/registration', async (req, res) => {
  const { login, password } = req.body
  try {
    const newUser = new User({
      login,
      password
    })
    await newUser.save()
    const { token, user } = await getTokenAndUser(req.body)
    createCookie(token, res)
    res.json({ status: 'ok', token, user })
  } catch (err) {
    res.json({ status: 'error', message: `registrate error ${err}` })
  }
})

server.use('/api/', (req, res) => {
  res.status(404)
  res.end()
})

const [htmlStart, htmlEnd] = Html({
  body: 'separator',
  title: 'Skillcrucial - Become an IT HERO'
}).split('separator')

server.get('/', (req, res) => {
  const appStream = renderToStaticNodeStream(<Root location={req.url} context={{}} />)
  res.write(htmlStart)
  appStream.pipe(res, { end: false })
  appStream.on('end', () => {
    res.write(htmlEnd)
    res.end()
  })
})

server.get('/*', (req, res) => {
  const initialState = {
    location: req.url
  }

  return res.send(
    Html({
      body: '',
      initialState
    })
  )
})

serve.listen(port)

io.on('connection', (socket) => {
  connections.push(socket)
  socket.on('send mess', (msg) => {
    io.emit('new message', msg)
  })
})

console.log(`Serving at http://localhost:${port}`)
