import jwt  from "jsonwebtoken";
import { apiError } from "../utils/apiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.models.js";


export const verifyJWT = asyncHandler(async (req, _, next) => {
    try {
        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "");
        console.log(token)
        if(!token){
            throw new apiError(401, "Unauthorized Request");
        }

        const decodedToken = await jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)

       const user = await User.findById(decodedToken?._id).select("-password -refreshToken");

       if(!user){
        // discuss about frontend
        throw new apiError(401, "Invalid Access Token")
       }

       req.user = user
       next()

    } catch (error) {
        throw new apiError(401, error?.message || "Invalid access token!")
    }
})