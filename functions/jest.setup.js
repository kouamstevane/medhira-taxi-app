const webStreams = require('stream/web');

global.ReadableStream = webStreams.ReadableStream;
global.WritableStream = webStreams.WritableStream;
global.TransformStream = webStreams.TransformStream;
