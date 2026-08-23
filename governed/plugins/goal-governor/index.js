// Preset-local loader. Keeping the composition path inside the governed
// preset avoids depending on whether a DSH loader permits `../` plugin rows;
// both installed presets still share one implementation and one reducer.
module.exports = require('../../../researcher/plugins/goal-governor/index.js')
