var config;

// if the path to config is defined in the env, use that
// otherwise assume some defaults that would be enough to
// prevent the tool from exploding
if (process.env.DDG_SCREENDIFF_CONFIG) {
    config = require(process.env.DDG_SCREENDIFF_CONFIG);
} else {
    config = {
        // this is the directory where the screenshots will be placed
        screenshotDir: process.cwd() + "/screenshots",
        // this is only used for the message once everything's done
        outputDir: process.cwd() + "/screenshots",
        // the directory where group JSON files are stored
        groupDir: process.cwd()
    };
}

// ... and expose
module.exports = config;
