// logger.js

// 创建日志工具
const logger = {
    // 信息日志
    info: (msg) => {
      if (typeof msg === 'object') {
        console.log(`INFO: ${JSON.stringify(msg, null, 2)}`); // 格式化对象输出
      } else {
        console.log(`INFO: ${msg}`);
      }
    },
  
    // 错误日志
    error: (msg) => {
      if (typeof msg === 'object') {
        console.error(`ERROR: ${JSON.stringify(msg, null, 2)}`); // 格式化对象输出
      } else {
        console.error(`ERROR: ${msg}`);
      }
    },
  };
  
  module.exports = logger; // 导出 logger 对象