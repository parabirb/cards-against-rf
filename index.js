/*
    this software is licensed under the gay sex license
*/
const xmlrpc = require("xmlrpc");
const Message = require("./message");
const readline = require("readline");
const EventEmitter = require("events");
const { whiteMap, blackMap } = require("./cardmap");

const regex = /[a-f0-9]/;

let messages = "";
let transmitting = true;
let callsign = "";
let state = {};
let game = new EventEmitter();
let pos = 0;
let rl = readline.promises.createInterface({
    input: process.stdin,
    output: process.stdout
});

// create client to interface with fldigi
const client = xmlrpc.createClient({
    host: "127.0.0.1",
    port: 7362
});

// nobody likes promises
function asyncRpc(method, params = []) {
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

// transmit message
async function beginTransmit(message) {
    transmitting = true;
    await asyncRpc("text.add_tx", [addStop(message)]);
    await asyncRpc("main.tx");
}

// turn string into hex
function convertHex(string) {
    for (let i = 0; i < string.length; i++) {
        if (!regex.test(string[i])) string[i] = "0";
    }
    return string;
}

// check rx loop
async function checkRxLoop() {
    if (await asyncRpc("main.get_trx_state") === "RX") transmitting = false;
}

// add to rx buffer loop
async function addToRxBufferLoop() {
    let newPos = await asyncRpc("text.get_rx_length") - pos;
    messages += (await asyncRpc("text.get_rx", [pos, newPos])).toString();
    messages = convertHex(messages);
    pos = newPos + pos;
}

// look for the latest message and process it if it exists loop
async function messageSearchLoop() {
    let currentMsgs = messages;
    let packets = currentMsgs.match(/(fa71ff)([a-f0-9][a-f0-9])+(ff71fa)/g);
    if (packets === null) return;
    else {
        messages = messages.slice(currentMsgs);
        let message = new Message();
        message.fromByteString(packets[0]);
        game.emit("message", message);
    }
}

// loop runner
function runLoops() {
    checkRxLoop();
    addToRxBufferLoop();
    messageSearchLoop();
}

// main function
async function main() {
    // get operator's callsign
    callsign = await rl.question("What is your callsign? ");
    callsign = callsign.toUpperCase();
    // select the mode
    let host = (await rl.question("Are you the host? (yes for yes, anything else for no) ")) === "yes";
    // if we're host
    if (host) {
        // initialize the game
        if ((await rl.question("Initialize game? (cancel to cancel, anything else for yes) ")) === "cancel") process.exit(0);
        // set up our loops, events, and initialize the game state
        state.started = false;
        state.order = [];
        state.points = [];
        state.entryClosed = false;
        state.cards = [];
        for (let i = 0; i < 10; i++) state.cards.push(Math.floor(Math.random() * blackMap.length));
        game.on("message", async (message) => {
            // if we're receiving our own message, return
            if (message.callsign === callsign) return;
            // if it's a join message
            if (message.type === "join" && !state.entryClosed) {
                console.log(`${message.callsign} has joined the game!`);
                state.order.push(message.callsign);
            }
            // if it's a placement of a white card
            else if (message.type === "whitePlace" && state.started && state.order[state.turn] === message.callsign && message.payload < whiteMap.length) {
                // push the card to the current round
                state.roundCards.push(whiteMap[message.payload]);
                // log to the user
                console.log(`${message.callsign} has placed their card!`);
                // acknowledge receipt of the card
                let ackMessage = new Message("acknowledge", callsign);
                // TODO: figure out if this needs to be uncommented - await beginTransmit(ackMessage.toByteString());
                // wait for tx to finish
                let interval = setInterval(async () => {
                    // if we're no longer transmitting
                    if (!transmitting) {
                        // clear the interval
                        clearInterval(interval);
                        // change the turn
                        if (state.turn !== state.order.length - 1) {
                            // increment the turn
                            state.turn++;
                            // tx the message for the next person to pick a card
                            let turnMessage = new Message("turn", callsign, state.order[state.turn]);
                            await beginTransmit(turnMessage.toByteString());
                        }
                        // otherwise, if it's our turn
                        else {
                            // prompt the user to pick the best card
                            console.log(`Your card: ${blackMap[state.cards[0]]}`);
                            console.log("Their cards:");
                            for (let card of state.roundCards) {
                                console.log(`${order[state.roundCards.indexOf(card)]} - ${card}`);
                            }
                            // ask them who got the best card
                            let best = await rl.question("Who had the best card? ");
                            // increment that user's points and get rid of our card
                            state.points[state.order.indexOf(best)]++;
                            state.cards.splice(0, 1);
                            // reset the round cards
                            state.roundCards = [];
                            // transmit our choice
                            console.log("Transmitting choice...");
                            let choiceMessage = new Message("choice", callsign, best);
                            await beginTransmit(choiceMessage.toByteString());
                            // wait for it to end
                            let interval2 = setInterval(async () => {
                                // if we've stopped transmitting
                                if (!transmitting) {
                                    // clear the interval
                                    clearInterval(interval2);
                                    // place a card if it isn't over
                                    if (state.cards.length !== 0) {
                                        console.log(`The next card is being placed... (${blackMap[state.cards[0]]})`);
                                        state.turn = 0;
                                        let cardPlacementMessage = new Message("blackPlace", callsign, state.cards[0]);
                                        await beginTransmit(cardPlacementMessage.toByteString());
                                    }
                                    // end the game if it is over
                                    else {
                                        // find the winner
                                        let highest = 0;
                                        for (let i = state.points.length - 1; i >= 0; i--) {
                                            if (state.points[i] >= state.points[highest]) highest = i;
                                        }
                                        // notify the user
                                        console.log(`The game has ended! ${state.order[i]} won. Transmitting message...`);
                                        // transmit the message
                                        let endMessage = new Message("end", callsign, state.order[i]);
                                        await beginTransmit(endMessage);
                                        // exit
                                        process.exit(0);
                                    }
                                }
                            }, 500);
                        }
                    }
                }, 500);
            }
        });
        setInterval(runLoops, 300);
        // send the initialization message
        let initMessage = new Message("init", callsign);
        await beginTransmit(initMessage.toByteString());
        // ask the user to close entry
        await rl.question("Press enter to stop accepting new players once you're ready. (please make sure nothing is being sent before closing entry)");
        // transmit the closed entry message
        state.entryClosed = true;
        let closeEntryMessage = new Message("closeEntry", callsign);
        await beginTransmit(closeEntryMessage.toByteString());
        for (let throwaway of state.order) state.points.push(0);
        // ask the user to start the game
        await rl.question("Press enter to start the game once you're ready. (please make sure nothing is being sent before starting the game)");
        // transmit the order message
        let orderMessage = new Message("order", callsign, state.order);
        await beginTransmit(closeEntryMessage.toByteString());
        // ask the user to place the first card
        await rl.question("Press enter to place the first card once you're ready. (please make sure nothing is being sent before placing the first card)");
        // notify the user of the first card
        console.log(`Placing the first card... (${blackMap[state.cards[0]]})`);
        // initialize the game
        state.turn = 0;
        state.started = true;
        // transmit the card placement message
        let placementMessage = new Message("blackPlace", callsign, state.cards[0]);
        await beginTransmit(placementMessage.toByteString());
    }
    // if we're a client
    else {
        await rl.question("Press enter when ready to start receiving host messages.");
        // set some state variables
        state.initialized = false;
        state.cards = [];
        state.order = [];
        state.roundCard = "";
        state.roundCards = [];
        state.joined = false;
        state.entryClosed = false;
        // set up events
        game.on("message", async (message) => {
            // discard any messages we receive from ourself
            if (message.callsign === callsign) return;
            // if it's an initialization message
            if (message.type === "init") {
                // notify the user
                console.log(`New game from ${message.callsign}!`);
                // modify the state
                state.host = message.callsign;
                state.initialized = true;
                // prompt the user to join
                if (await rl.question("Join game? (yes for yes, anything else for no) (DO NOT JOIN UNTIL YOU HAVE CONFIRMED NOBODY IS TRANSMITTING) ") !== "yes" || state.entryClosed) return;
                // send the join message
                let joinMessage = new Message("join", callsign);
                await beginTransmit(joinMessage.toByteString());
                // set joined to true
                state.joined = true;
            }
            // if joins have closed
            else if (message.type === "closeEntry") {
                // notify the user
                console.log("Game entry has closed and the game is starting!");
                // set entry closed to true
                state.entryClosed = true;
            }
            // if it's the turn order
            else if (message.type === "order") {
                // notify the user
                console.log(`The order of players has been decided! ${message.payload.join(", ")}`);
                // if we're not in there, reset our joined value
                if (!message.payload.includes(callsign)) joined = false;
                // set the order of the game
                state.order = message.payload;
            }
            // if it's a black card placement
            else if (message.type === "blackPlace") {
                // notify the user
                console.log(`A black card has been placed! ${blackMap[message.payload]}`);
                // set round cards to an empty array
                state.roundCards = [];
                // set the round card
                state.roundCard = blackMap[message.payload];
                // if we're first, prompt the user to pick a card
                if (state.joined) {
                    // if we don't have 10 cards, get to 10 cards
                    while (state.cards.length !== 10) {
                        state.cards.push(Math.floor(Math.random() * whiteMap.length));
                    }
                    // if we're first
                    if (state.order.indexOf(callsign) === 0) {
                        // notify the user
                        console.log("It's your turn! Your cards are:");
                        // show them their cards
                        for (let i = 0; i < 10; i++) {
                            console.log(`Index ${i}: ${whiteMap[state.cards[i]]}`);
                        }
                        // ask them which card they want to place
                        let index = +(await rl.question("Which card do you want to place? (refer to it by index) "));
                        // place their card
                        let cardPlaceMessage = new Message("whitePlace", callsign, state.cards[index]);
                        await beginTransmit(cardPlaceMessage.toByteString());
                        // push the card to the round cards
                        state.roundCards.push(`${callsign} - ${whiteMap[state.cards[i]]}`);
                        // get rid of that card
                        state.cards.splice(index, 1);
                    }
                }
            }
            // if it's a white card placement
            else if (message.type === "whitePlace") {
                // push the card to the round cards
                state.roundCards.push(`${message.callsign} - ${whiteMap[message.payload]}`);
                // notify the user
                console.log(`${message.callsign} has placed their card!`);
                // if it's the last person, reveal the cards placed
                if (state.order.indexOf(message.callsign) === state.order.length - 1) {
                    console.log("It's time for the host to choose! The cards placed in response to the prompt were:\n" + state.roundCards.join("\n"));
                    console.log(`The prompt was: ${state.roundCard}`);
                }
            }
            // if it's a turn (someone else)
            else if (message.type === "turn" && message.payload !== callsign) {
                // notify the user
                console.log(`It's ${message.payload}'s turn!`);
            }
            // if it's our turn
            else if (message.type === "turn") {
                // notify the user
                console.log("It's your turn! Your cards are:");
                // show them their cards
                for (let i = 0; i < 10; i++) {
                    console.log(`Index ${i}: ${whiteMap[state.cards[i]]}`);
                }
                // show them the prompt
                console.log(`The prompt was: ${state.roundCard}`);
                // ask them which card they want to place
                let index = +(await rl.question("Which card do you want to place? (refer to it by index) "));
                // place their card
                let cardPlaceMessage = new Message("whitePlace", callsign, state.cards[index]);
                await beginTransmit(cardPlaceMessage.toByteString());
                // push the card to the round cards
                state.roundCards.push(`${callsign} - ${whiteMap[state.cards[i]]}`);
                // get rid of that card
                state.cards.splice(index, 1);
                // if we're the last person, reveal the cards placed
                if (state.order.indexOf(callsign) === state.order.length - 1) {
                    console.log("It's time for the host to choose! The cards placed in response to the prompt were:\n" + state.roundCards.join("\n"));
                    console.log(`The prompt was: ${state.roundCard}`);
                }
            }
            // if it's someone else being chosen
            else if (message.type === "choose" && message.payload !== callsign) {
                // notify the user
                console.log(`The host chose ${message.payload}'s card!`);
            }
            // if it's us being chosen
            else if (message.type === "choose") {
                // notify the user
                console.log("The host chose your card!");
            }
            // if it's the game end (someone else won)
            else if (message.type === "end" && message.payload !== callsign) {
                // notify the user
                console.log(`The game has ended with ${message.payload} as the winner!`);
                // exit
                process.exit(0);
            }
            // if we won
            else if (message.type === "end") {
                // notify the user
                console.log("The game has ended with you as the winner!");
                // exit
                process.exit(0);
            }
        });
    }
}

main();