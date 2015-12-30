// these are based on our CSS width breakpoints
// all sizes except for teapot and breadbox assume a 16:9 screen
// all sizes except for xs are landscape
var SIZES = {
    xs: {
        width: 420,
        height: 755
    },
    s: {
        width: 630,
        height: 354
    },
    m: {
        width: 860,
        height: 483
    },
    l: {
        width: 1085,
        height: 610
    },
    xl: {
        width: 1440,
        height: 812
    },
    teapot: {
        width: 640,
        height: 790
    },
    breadbox: {
        width: 870,
        height: 640
    }
};

exports.getSize = function (sizeName) {
    return SIZES[sizeName];
};

exports.getAvailableSizes = function () {
    return Object.keys(SIZES);
};
