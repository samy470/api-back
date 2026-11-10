import express from 'express'
import cors from 'cors'
import type {Express, Request, Response} from 'express'
import { router } from './router/Router.ts'
import mongoose from 'mongoose'
import 'dotenv/config'

const port: number = Number(process.env.PORT) || 8000
const app: Express = express()
app.use(express.json())
app.use(cors())

app.use('/', router)

app.use((req: Request, res: Response) => {
    res.status(404).json({message:"No route found"})
})

mongoose.connect(process.env.MONGO_URI as string).then(() => {
    app.listen(port, (): void => {
        console.log('your app is running on', port)
    })
})