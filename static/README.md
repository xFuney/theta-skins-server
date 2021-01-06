# Theta Skins Server
A replacement for the now-removed legacy Minecraft Skins API, as well as providing a few fixes for older versions.

# Run Instructions
- Clone the repository.
- Run ``npm install``
- Populate the "resources" folder with the contents of `.minecraft/resources` (follow the readme file in the folder for more information)
- Start the program with ``npm run test``

The program will automatically make directories and XML files.

# How to Access

Append the following string to your hosts file:
```
<your-server-ip>    s3.amazonaws.com
```

Be sure to disable this after playing though, as a lot of the internet relies on Amazon S3 services and this server cannot provide all of them.