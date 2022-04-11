const ReedSolomon = require("./reedsolomon");

// reed-solomon
const rs = new ReedSolomon(20);

// message types
const types = [
    "init",
    "join",
    "closeEntry",
    "order",
    "turn",
    "blackPlace",
    "whitePlace",
    "choose",
    "end",
    "retransmit"
];

// encode utf8 and decode utf8
function encodeUtf8(array) {
    let toReturn = "";
    for (codepoint of array) {
        toReturn += String.fromCharCode(codepoint);
    }
    return toReturn;
}

function decodeUtf8(string) {
    let toReturn = [];
    for (character of string) {
        toReturn.push(character.charCodeAt(0));
    }
    return toReturn;
}

// pad and unpad callsigns
function unpadCallsign(padded) {
    return padded.trim();
}

function padCallsign(callsign) {
    return callsign.padStart(6, " ");
}

// message class
class Message {
    // construct a message from its type, callsign, and payload
    constructor(type = null, callsign = null, payload = null) {
        this.type = type;
        this.callsign = callsign;
        this.payload = payload;
    }

    // create a message from bytes
    fromBytes(bytes) {
        // convert our buffer to an array
        let array = [...bytes];
        // slice off the header and footer
        array.splice(0, 3);
        array.splice(array.length - 3, 3);
        // decode with reed-solomon coding
        let decoded = decodeUtf8(rs.decode(array));
        // set our type
        this.type = types[decoded[0]];
        decoded.splice(0, 1);
        // get our callsign
        this.callsign = unpadCallsign(encodeUtf8(decoded.slice(0, 6)));
        decoded.splice(0, 6);
        // decode our payload, if it exists
        if (this.type === "init" || this.type === "join" || this.type === "closeEntry" || this.type === "retransmit") this.payload = null;
        else if (this.type === "order") {
            this.payload = [];
            for (let i = 0; i < decoded.length; i += 6) {
                this.payload.push(unpadCallsign(encodeUtf8(decoded.slice(i, i + 6))));
            }
        } else if (this.type === "turn" || this.type === "end" || this.type === "choose") this.payload = unpadCallsign(encodeUtf8(decoded));
        else if (this.type === "blackPlace" || this.type === "whitePlace") this.payload = decoded[0] + decoded[1];
    }

    // check if a message is a message
    static isMessage(message) {
        return message[0] === 0xFA && message[1] === 0x71 && message[2] === 0xFF && message[message.length - 3] === 0xFF && message[message.length - 2] === 0x71 && message[message.length - 1] === 0xFA;
    }

    // convert a message to bytes
    toBytes() {
        // init a byte array
        let byteArray = [];
        // push the header
        byteArray.push(0xFA, 0x71, 0xFF);
        // push the message type
        byteArray.push(types.indexOf(this.type));
        // push the callsign
        byteArray.push(...decodeUtf8(padCallsign(this.callsign)));
        // push the payload
        if (this.type === "order") {
            for (let player of this.payload) byteArray.push(...decodeUtf8(padCallsign(player)));
        } else if (this.type === "turn" || this.type === "end" || this.type === "choose") byteArray.push(...decodeUtf8(padCallsign(this.payload)));
        else if (this.type === "blackPlace" || this.type === "whitePlace") byteArray.push(this.payload >= 255 ? 255 : this.payload, this.payload >= 255 ? this.payload - 255 : 0);
        // apply reed-solomon coding
        byteArray.push(...rs.encode(encodeUtf8(byteArray.splice(3))));
        // push the footer
        byteArray.push(0xFF, 0x71, 0XFA);
        // return a buffer from the byte array
        return Buffer.from(byteArray);
    }
    toByteString() {
        return this.toBytes().toString("hex");
    }
    fromByteString(byteString) {
        this.fromBytes(Buffer.from(byteString, "hex"));
    }
}

module.exports = Message;