import { asyncHandler } from "../utils/asyncHandler.js";
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.models.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { apiResponse } from "../utils/apiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
  // get user details from frontend
  // validation - eg: not empty etc.
  // check if user already exists: username/email
  // check for images, avatar is required
  // upload them on cloudinary - avatar
  // create an object for user - create entry in db
  // remove password and refresh token field from response
  // check for user creation
  // return res

  const { fullName, email, username, password } = req.body
  console.log("email: ", email);

  if (
    [fullName, username, password, email].some((field) => field?.trim() === "")
  ) {
    throw new apiError(400, "All fields are required!");
  }

  const existedUser = User.findOne({
    $or: [{ username }, { email }]
  })

  if(existedUser){
    throw new apiError(409, "User already exist! please login")
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;
  const coverImageLocalPath = req.files?.coverImage[0]?.path;

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
    new apiResponse(200, createdUser, "User registered successfully!");
  )

});

export { registerUser };
