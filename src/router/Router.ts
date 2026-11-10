import express from 'express'
import type { Router } from 'express'
import { getData, addUsers, login, buy, sell, getPortfolio } from '../controller/Controller.ts'

export const router: Router = express.Router()

router.get('/get', getData)
router.get('/portfolio', getPortfolio)
router.post('/register', addUsers)
router.post('/login', login)
router.post('/buy', buy)
router.post('/sell', sell)