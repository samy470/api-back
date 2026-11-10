import type { Request, Response } from "express";
import type { IUser } from "../models/Users.ts";
import Users from "../models/Users.ts";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt"

type userType = {
    username: string,
    password: string,
}

type MarketCoin = { id: string, current_price: number }
let cache: MarketCoin[] = []
let cacheTime = 0

async function getMarket(): Promise<MarketCoin[]> {
    if (cache.length && Date.now() - cacheTime < 60000) return cache
    const response = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1", {
        headers: { "x-cg-demo-api-key": process.env.CG_API_KEY as string }
    })
    if (!response.ok) throw new Error('coingecko failed')
    cache = (await response.json()) as MarketCoin[]
    cacheTime = Date.now()
    return cache
}

export const getData = async (req: Request, res: Response): Promise<void> => {
    try {
        res.json(await getMarket())
    } catch {
        res.status(502).json({ message: 'could not load prices' })
    }
}

export const getPortfolio = async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) { res.status(401).json({ message: 'not logged in' }); return }
    let userId: string
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { id: string }
        userId = decoded.id
    } catch {
        res.status(401).json({ message: 'invalid or expired token' })
        return
    }

    const user = await Users.findById(userId)
    res.json({ portfolio: user?.portfolio, balance: user?.balance })
}

export const addUsers = async (req: Request, res: Response): Promise<void | Response> => {
    const { username, password }: userType = req.body

    const existUser = await Users.findOne({ username })
    if (existUser) { return res.status(409).json({ message: 'username already exists' }) }

    const hashed: string = await bcrypt.hash(password, 10)
    const newUser: IUser = new Users({ username: username, password: hashed })
    await newUser.save()
    res.status(201).json({ message: 'user created' })
}

export const login = async (req: Request, res: Response): Promise<void | Response> => {
    const { username, password }: userType = req.body

    const user = await Users.findOne({ username })
    if (!user) return res.status(401).json({ error: 'wrong username or password' })

    const isMatch: boolean = await bcrypt.compare(password, user.password)
    if (!isMatch) return res.status(401).json({ error: 'wrong username or password' })

    const token: string = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, { expiresIn: '1d' })
    res.json({ token })
}

export const buy = async (req: Request, res: Response): Promise<void> => {
    const { coinId, amount } = req.body

    if (typeof amount !== 'number' || !(amount > 0)) {
        res.status(400).json({ message: 'invalid amount' })
        return
    }

    let current_price: number
    try {
        const coin = (await getMarket()).find(c => c.id === coinId)
        if (!coin) { res.status(400).json({ message: 'unknown coin' }); return }
        current_price = coin.current_price
    } catch {
        res.status(502).json({ message: 'could not load prices' })
        return
    }

    const token = req.headers.authorization?.split(' ')[1]
    if (!token) { res.status(401).json({ message: 'not logged in' }); return }
    let userId: string
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { id: string }
        userId = decoded.id
    } catch {
        res.status(401).json({ message: 'invalid or expired token' })
        return
    }

    const user = await Users.findById(userId)
    const existing = user?.portfolio.find(p => p.coinId === coinId)
    if (!user) { res.status(404).json({ message: 'user not found' }); return }

    if (user?.balance >= amount * current_price) {
        if (existing) {
            await Users.findOneAndUpdate(
                { _id: userId, 'portfolio.coinId': coinId },
                {
                    $inc: {
                        'portfolio.$.amount': amount,
                        balance: -(amount * current_price)
                    }
                }
            )
        } else {
            await Users.findByIdAndUpdate(userId, {
                $push: { portfolio: { coinId, amount } },
                $inc: { balance: -(amount * current_price) }
            })
        }
        res.status(200).json({ message: 'coin added to portfolio' })
    } else {
        res.status(400).json({ message: 'you are broke' })
    }
}

export const sell = async (req: Request, res: Response): Promise<void | Response> => {
    const { coinId, amount } = req.body

    if (typeof amount !== 'number' || !(amount > 0)) {
        return res.status(400).json({ message: 'invalid amount' })
    }

    let current_price: number
    try {
        const coin = (await getMarket()).find(c => c.id === coinId)
        if (!coin) { res.status(400).json({ message: 'unknown coin' }); return }
        current_price = coin.current_price
    } catch {
        return res.status(502).json({ message: 'could not load prices' })
    }

    const token = req.headers.authorization?.split(' ')[1]
    if (!token) { res.status(401).json({ message: 'not logged in' }); return }
    let userId: string
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as unknown as { id: string }
        userId = decoded.id
    } catch {
        res.status(401).json({ message: 'invalid or expired token' })
        return
    }

    const user = await Users.findById(userId)
    const existing = user?.portfolio.find(p => p.coinId === coinId)
    if (!existing) { return res.status(200).json({ message: 'you dont have that coin' }) }

    if (amount > (existing.amount as number)) {
        return res.status(400).json({ message: 'you dont have enough' })
    }

    if ((existing.amount as number) - amount < 1e-9) {
        await Users.findByIdAndUpdate(userId, {
            $pull: { portfolio: { coinId } },
            $inc: { balance: existing.amount as number * current_price }
        })
    } else {
        await Users.findOneAndUpdate(
            { _id: userId, 'portfolio.coinId': coinId },
            { $inc: { 'portfolio.$.amount': -amount, balance: amount * current_price } }
        )
    }
    res.status(200).json({ message: 'sold' })
}