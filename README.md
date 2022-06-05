# Cards Against RF
Cards Against RF is an implementation of Cards Against Humanity (specifically using the Family Pack for legal reasons) for amateur radio. It interfaces with Fldigi to allow usage with multiple modes (Olivia 16/500 is recommended, though). Please note that to do a game, you will probably want to do some organizing out of band.

## Requirements
CARF requires the latest NodeJS version (v18.3.0), as well as several npm dependencies. To quickly install them, run `npm i`. Fldigi is required, as it modulates the signal into your chosen mode from hex data.

## How do I actually use this?
It's easy! First, install the dependencies like above. Then, download/clone this repo, and run a terminal in the downloaded folder. Run the command `node index.js`, enter your callsign, and play away!
