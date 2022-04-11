/*
    this software is licensed under the gay sex license
*/
const xmlrpc = require("xmlrpc");
const Message = require("./message");
const readline = require("readline");

let messages = "";
let transmitting = true;
let callsign = "";

// create client to interface with fldigi
const client = xmlrpc.createClient({
    host: "localhost",
    port: 7362
});

// nobody likes promises
function asyncRpc(method, params) {
    return new Promise(resolve => {
        client.methodCall(method, params, (err, val) => {
            if (err) throw err;
            resolve(val);
        });
    })
}

// add ^r so that it stops
function addStop(string) {
    return string + "^r";
}

// turn string into hex
function convertHex(string) {
    for (let i = 0; i < string.length; i++) {
        if (!string[i].test("[a-f0-9]")) string[i] = "0";
    }
}



// main function
async function main() {
}

main();