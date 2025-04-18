const _ = require('lodash');
const moment = require('moment');

const { getTVL } = require('../../methods');
const { getAssets, getITSAssets } = require('../../utils/config');

module.exports = async params => {
  const hour = moment().hours();
  const minute = moment().minutes();

  // get TVL of custom assets
  await getTVL({ forceCache: true, isIntervalUpdate: true, customAssetsOnly: true });

  const assetsData = _.concat(await getAssets(), await getITSAssets())
    .filter(d => !params?.id || d.id === params.id) // filter by params.id
    .filter(d => params?.id || (hour % 2 === 0 ? d.id.startsWith('0x') : !d.id.startsWith('0x'))) // run ITS on even hour, otherwise gateway
    .filter((d, i) => params?.id || parseInt(minute / 6) === i % 10); // seperate assets to run by minute into 10 groups

  const data = {};

  for (const { id } of assetsData) {
    // get TVL of each asset
    data[id] = await getTVL({ asset: id, forceCache: true, isIntervalUpdate: true });
  }

  return data;
};