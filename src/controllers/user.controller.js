import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { apiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken"
import mongoose from "mongoose";

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false})

        return { accessToken, refreshToken };

    } catch (error) {
        throw new apiError(500, "Something went wrong while generating access and refresh token")
    }
}

const registerUser = asyncHandler(async (req, res) => {


  const { fullName, email, username, password } = req.body
  console.log("email: ", email);

  if (
    [fullName, username, password, email].some((field) => field?.trim() === "")
  ) {
    throw new apiError(400, "All fields are required!");
  }

  const existedUser = await User.findOne({
    $or: [{ username }, { email }]
  })

  if(existedUser){
    throw new apiError(409, "User already exist! please login")
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
//   const coverImageLocalPath = req.files?.coverImage[0]?.path;
 let coverImageLocalPath;
 if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
    coverImageLocalPath = req.files.coverImage[0].path
 }

  if(!avatarLocalPath){
    throw new apiError(400, "Avatar is necessary to be uplaoded!")
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage =  await uploadOnCloudinary(coverImageLocalPath);

  if(!avatar){
    throw new apiError(400, "Avatar is necessary to be uplaoded!")
  }

  const user = await User.create({
    fullName,
    email,
    password,
    username: username.toLowerCase(),
    avatar: avatar.url,
    coverImage: coverImage?.url || ""
  })

  const createdUser = await User.findById(user._id).select("-password -refreshToken")

  if(!createdUser){
    throw new apiError(500, "something went wrong while registering the user!!");
  }

  return res.status(201).json(
    new apiResponse(200, createdUser, "User registered successfully!")
  )

});

const loginUser = asyncHandler(async (req, res) => {
    //take data {username, password}
    // find the user if not singUp else follow below procedure
    // check if password is same as in database or not
    // access and refresh token generate
    // send cookie

    const {email, username, password} = req.body
    console.log(email)

    if(!username && !email){
        throw new apiError(400, "username or email is required!")
    }

    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if(!user){
        throw new apiError(404, "User does not exist!");
    }

    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new apiError(401, "Password is incorrect!");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new apiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User loggedIn successfully!"
        )
    )
})

const logoutUser = asyncHandler(async (req, res) => {
 await User.findByIdAndUpdate(
    req.user._id,
    {
        $set: {
            refreshToken: undefined
        }
    },
    {
        new: true
    }
 )
 const options = {
    httpOnly: true,
    secure: true
 }

 res
 .status(200)
 .clearCookie("accessToken", options)
 .clearCookie("refreshToken", options)
 .json(new apiResponse(200, {}, "User loggedOut successfully!"))
})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new apiError(401, "Unauthorized request")
    }

   try {
     const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
     const user = await User.findById(decodedToken?._id)
     if(!user){
         throw new apiError(401, "invalid refresh token")
     }
 
     if(incomingRefreshToken !== user?.refreshToken){
         throw new apiError(401, "Refresh token is expired or used")
     }
 
     const options = {
         httpOnly: true,
         secure: true
     }
 
     const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id)
 
     return res
     .status(200)
     .cookie("accessToken", accessToken, options)
     .cookie("refreshToken", refreshToken, options)
     .json(
         new apiResponse(200,
             {accessToken, refreshToken},
             "Access token refreshed"
         )
     )
   } catch (error) {
    throw new apiError(401, error?.message || "Invalid refresh token")
   }

})

const changeCurrentPassword = asyncHandler(async (req, res) => {
 const { oldPassword, newPassword } = req.body

const user = await User.findById(req.user?._id)
const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
if(!isPasswordCorrect){
    throw new apiError(400, "Old password is incorrect!");
}

user.password = newPassword
await user.save({ validateBeforeSave: false })

res
.status(200)
.json(
    new apiResponse(200, {}, "Password changed successfully!")
)

})

const getCurrentUser = asyncHandler(async (req, res) => {
   return res
   .status(200)
   .json(
    new apiResponse(200, req.user, "Current user fetched successfully!")
   )
})

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullName, email } = req.body

    if(!fullName || !email){
        throw new apiError(400, "Please fill-in all fields!")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullName,
                email: email
            }
        },
        {
            new: true
        }
    ).select("-password")

    return res
    .status(200)
    .json(
        new apiResponse(
            200, user, "Account details updated successfully!"
        )
    )
})

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path
    if(!avatarLocalPath){
        throw new apiError(400, "Avatar file is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar.url){
        throw new apiError(400, "Error while uploading avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        { new: true }
    ).select("-password")

    res
    .status(200)
    .json(
        new apiResponse(200, user, "Avatar updated successfully!")
    )
})

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new apiError(400, "Avatar file is missing")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if(!coverImage.url){
        throw new apiError(400, "Error while uploading avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            }
        },
        { new: true }
    ).select("-password")

    res
    .status(200)
    .json(
        new apiResponse(200, user, "Cover Image updated successfully!")
    )
})

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params

    if(!username?.trim()){
        throw new apiError(400, "Username not found!")
    }

    const channel = await User.aggregate[
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                   subscribersCount: {
                    $size: "$subscribers"
                   },
                   channelSubscribedToCount: {
                    $size: "$subscribedTo"
                   },
                   isSubscribed: {
                    $cond: {
                        if: {$in : [req.user?._id, "$subscribers.subscriber"]},
                        then: true,
                        else: false
                    }
                   }
            }
        },
        {
            $project: {
                fullName: 1,
                username: 1,
                subscribersCount: 1,
                channelSubscribedToCount: 1,
                isSubscribed: 1,
                avatar: 1,
                coverImage: 1,
                email: 1
            }
        }
    ]

    if(!channel?.length){
       throw new apiError(404, "Channel not found!")
    }

    res
    .status(200)
    .json(
        new apiResponse(200, channel[0], "Channel details fetched successfully!")
    )

})

const getWatchHistory = asyncHandler(async (req, res) => {
    
    const user = await User.aggregate[
        {
            $match: {
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup: {
                from: "videos",
                localField: "watchHistory",
                foreignField: "_id",
                as: "watchHistory",
                pipeline: [
                    {
                        $lookup: {
                            from: "users",
                            localField: "owner",
                            foreignField: "_id",
                            as: "owner",
                            pipeline: [
                                {
                                    $project: {
                                        fullName: 1,
                                        userName: 1,
                                        avatar: 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields: {
                            owner: {
                                $first: "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ]

    return res
    .status(200)
    .json(
        new apiResponse(200, user[0].watchHistory, "Watch history fetched successfully!")
    )
})

export { registerUser, loginUser, logoutUser, refreshAccessToken, changeCurrentPassword, getCurrentUser, updateAccountDetails, updateUserAvatar, updateUserCoverImage, getUserChannelProfile, getWatchHistory  };
