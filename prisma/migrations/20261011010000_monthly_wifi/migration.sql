-- Store real Wi-Fi credentials by meeting month. No default or demo records.
CREATE TABLE "WifiMonthlySetting" (
    "month" TEXT NOT NULL PRIMARY KEY,
    "ssid" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
