var Promise = require("bluebird"),
    request = Promise.promisifyAll(require("request")),
    compressjs = require("compressjs"),
    bzip = compressjs.Bzip2,

    METADATA_BZIP_URL = "https://ddg-community.s3.amazonaws.com/metadata/repo_all.json.bz2",

    cachedMetadata;

/**
 * Get metadata from the database
 *
 * @param {string} iaName
 * @returns {Promise} - contains JSON object with the metadata
 */
exports.getMetadataForIA = function (iaName) {
    return getAllMetadata()
        .then(function (allMetadata) {
            var iaData = allMetadata[iaName];

            if (!iaData) {
                return Promise.reject(new Error("Couldn't find metadata for IA: " + iaName + ". Is it live?"));
            } else if (iaData.dev_milestone !== "live") {
                return Promise.reject(new Error("IA " + iaName + " isn't live"));
            } else {
                return Promise.resolve(iaData);
            }
        });
}

function getAllMetadata() {
    if (cachedMetadata) {
        return Promise.resolve(cachedMetadata);
    }

    return getMetadataFromS3()
        .then(unzipResponse)
        .then(JSON.parse)
        .then(function (metadata) {
            cachedMetadata = metadata;

            return cachedMetadata;
        });
};

function getMetadataFromS3() {
    return request.getAsync({ url: METADATA_BZIP_URL, encoding: null });
}

function unzipResponse(res) {
    var unzippedData = bzip.decompressFile(new Buffer(res.body));

    return new Buffer(unzippedData).toString("utf8");
}
