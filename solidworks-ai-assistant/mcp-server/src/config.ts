import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  mockMode: process.env.MOCK_MODE === "true",
  solidworksPath:
    process.env.SOLIDWORKS_PATH ||
    "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\SLDWORKS.exe",
  logLevel: process.env.LOG_LEVEL || "info",
};
