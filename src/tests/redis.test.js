const { redis, queues } = require("../../lib");

const test = async () => {
  console.log(await redis.redisSetInQueue(222));
  console.log(await redis.redisIsUserWaiting(222));
  queues.stop();
};

test();
