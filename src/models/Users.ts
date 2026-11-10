import mongoose, { Document, model } from 'mongoose'

export interface IUser extends Document {
    username: string
    password: string
    balance: number
    portfolio: {coinId: string, amount: Number}[]
}

const userSchema = new mongoose.Schema<IUser>({
    username: {type:String, required:true},
    password: {type:String, required: true},
    balance: { type: Number, default: 10000 },
    portfolio: [{coinId: String, amount: Number}]
})

const Users = mongoose.model<IUser>('Users', userSchema)

export default Users