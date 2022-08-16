const {
  BigNumber,
  providers: { FallbackProvider, JsonRpcProvider },
  utils: { formatUnits },
} = require('ethers');
const _ = require('lodash');
const moment = require('moment');
const config = require('config-yml');
const {
  write,
} = require('../index');
const assets_price = require('../assets-price');
const {
  equals_ignore_case,
  get_granularity,
  getTransaction,
  getBlockTime,
} = require('../../utils');

const environment = process.env.ENVIRONMENT || config?.environment;

const data = require('../../data');
const evm_chains_data = data?.chains?.[environment]?.evm || [];
const assets_data = data?.assets?.[environment] || [];

const {
  gateway,
} = { ...config?.[environment] };
const {
  chains,
  contracts,
} = { ...gateway };

module.exports = async (
  params = {},
) => {
  let response;

  const {
    contractAddress,
  } = { ...params };
  let {
    event,
    chain,
  } = { ...params };

  if (chain) {
    chain = chain.toLowerCase();
  }

  const {
    endpoints,
  } = { ...chains?.[chain] }

  if (!(event && chain && contractAddress)) {
    response = {
      error: true,
      code: 400,
      message: 'parameters not valid',
    };
  }
  else if (!chains?.[chain]) {
    response = {
      error: true,
      code: 400,
      message: 'chain not valid',
    };
  }
  else if (!(endpoints?.rpc && equals_ignore_case(contracts?.[chain]?.address, contractAddress))) {
    response = {
      error: true,
      code: 500,
      message: 'wrong api configuration',
    };
  }
  else {
    // setup provider
    const rpcs = endpoints.rpc;
    const provider = rpcs.length === 1 ?
      new JsonRpcProvider(rpcs[0]) :
      new FallbackProvider(rpcs.map((url, i) => {
        return {
          provider: new JsonRpcProvider(url),
          priority: i + 1,
          stallTimeout: 1000,
        };
      }));

    const {
      _id,
      transactionHash,
      transactionIndex,
      logIndex,
      blockNumber,
    } = { ...event };
    const event_name = event.event;

    // initial variables
    let id = _id || `${transactionHash}_${transactionIndex}_${logIndex}`;
    event.id = id;
    event.chain = chain;
    event.contract_address = contractAddress;

    // save each event
    switch (event_name) {
      case 'TokenSent':
        try {
          event = {
            ...await getTransaction(
              provider,
              transactionHash,
              chain,
            ),
            block_timestamp: await getBlockTime(
              provider,
              blockNumber,
            ),
            ...event,
          };

          const {
            block_timestamp,
            returnValues,
          } = { ...event };
          const {
            symbol,
          } = { ...returnValues };
          let {
            amount,
          } = { ...returnValues };

          if (block_timestamp) {
            event = {
              ...event,
              created_at: get_granularity(moment(block_timestamp * 1000).utc()),
            };
          }

          const chain_data = evm_chains_data.find(c => equals_ignore_case(c?.id, chain));
          const {
            chain_id,
          } = { ...chain_data };

          const asset_data = assets_data.find(a =>
            equals_ignore_case(a?.symbol, symbol) ||
            a?.contracts?.findIndex(c => c?.chain_id === chain_id && equals_ignore_case(c?.symbol, symbol)) > -1
          );

          if (asset_data) {
            const {
              id,
              contracts,
            } = { ...asset_data };
            let {
              decimals,
            } = { ...asset_data };

            const contract_data = contracts?.find(c => c.chain_id === chain_id);

            if (contract_data) {
              decimals = contract_data.decimals || decimals || 18;
              amount = Number(
                formatUnits(
                  BigNumber.from(amount || '0').toString(),
                  decimals
                )
              );

              const _response = await assets_price({
                denom: id,
                timestamp: moment((block_timestamp || 0) * 1000).valueOf(),
              });

              let {
                price,
              } = { ..._.head(_response) };
              price = typeof price === 'number' ?
                price :
                undefined;

              event = {
                ...event,
                amount,
                denom: id,
                price,
                value: typeof price === 'number' ?
                  amount * price:
                  undefined,
              };
            }
          }

          response = {
            response: {
              ...await write(
                'token_sent_events',
                id,
                {
                  event,
                },
                true,
              )
            },
            data: {
              event,
            },
          };
        } catch (error) {}
        break;
      default:
        break;
    }
  }

  return response;
};