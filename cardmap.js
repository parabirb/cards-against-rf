// code creates a map so we can refer to cards by index

const cards = require("./cards.json");

let whiteMap = [];
let blackMap = [];

for (card of cards.white) {
    whiteMap.push(card.text);
}

for (card of cards.black) {
    blackMap.push(card.text);
}

module.exports = {
    whiteMap,
    blackMap
};