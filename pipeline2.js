const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise'); // 使用 promise 版本
const axios = require('axios');
const os = require('os'); // 用于获取网络接口信息
const fs = require('fs'); // 用于文件操作
const logger = require('./logger.js');
const moment = require('moment-timezone')

const app = express();
const PORT = process.argv[2] || 8080;

// 创建数据库连接池配置 - 使用 promise 版本
const pool = mysql.createPool({
  host: '9.134.107.151',
  user: 'root',
  password: 'xuMwn*6829pBfx',
  port: '3306',
  database: 'svn_tool',
  waitForConnections: true,
  connectionLimit: 10, // 根据实际情况调整
  queueLimit: 0,
});

app.use(bodyParser.json());

// 获取公共路径函数
function getCommonPath(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    logger.info("paths 是空数组或无效数据");
    return '';
  }

  // 初始化公共路径为第一个路径
  let commonPath = paths[0];
  logger.info(`初始公共路径为：${commonPath}`);

  // 遍历剩余路径，逐步缩短公共路径
  for (let i = 1; i < paths.length; i++) {
    const currentPath = paths[i];
    logger.info(`正在比较路径：${commonPath} 和 ${currentPath}`);

    let j = 0;
    while (
      j < commonPath.length &&
      j < currentPath.length &&
      commonPath[j] === currentPath[j]
    ) {
      j++;
    }

    // 更新公共路径
    commonPath = commonPath.slice(0, j);
    logger.info(`更新后的公共路径为：${commonPath}`);

    // 如果公共路径已经为空，则无需继续比较
    if (commonPath === '') {
      break;
    }
  }

  // 去掉末尾的斜杠（如果有）
  commonPath = commonPath.replace(/\/$/, '');
  logger.info(`最终提取的公共路径为：${commonPath}`);
  return commonPath;
}

// 发送 HTTP 请求
async function sendCurlRequest(responsible_person) {
  try {
    const response = await axios.post(
      'https://devops.woa.com/ms/process/api/external/pipelines/5008f6e6361445abaf413486456dc3ae/build',
      { allResponsibles: responsible_person },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-DEVOPS-PROJECT-ID': 'pmgame',
          'X-DEVOPS-UID': '',
        },
        timeout: 5000, // 超时时间为 5 秒
      }
    );

    logger.info({
      message: "curl 请求成功",
      data: response.data,
    });
  } catch (error) {
    logger.error({
      message: "curl 请求失败",
      error: error.message,
    });
  }
}

// 处理 Web 钩子请求的函数
async function handleWebhookRequest(reqBody) {
  const { user_name, paths, push_timestamp, message, files } = reqBody;

  logger.info({
    message: "完整请求体内容",
    body: reqBody,
  });

  if (!Array.isArray(paths) || paths.length === 0) {
    logger.info("paths 是空数组或无效数据");
    return { status: 200, message: "提交的文件不在匹配规则内" };
  }

  const commonPath = getCommonPath(paths);
  if (!commonPath) {
    logger.info("未能提取到公共路径，提交的文件不在匹配规则内");
    return { status: 200, message: "提交的文件不在匹配规则内" };
  }

  logger.info(`从 paths 提取的公共路径为：${commonPath}`);

  const conn = await pool.getConnection();
  try {
    const [branchRows] = await conn.execute('SELECT * FROM SVN_directory_submission_reminder');
    logger.info({
      message: "从数据库中查询到的目录信息",
      rows: branchRows,
    });

    let matchedBranches = []; // 存储所有匹配的目录及负责人

    for (const branch of branchRows) {
      const { directory_name, responsible_person } = branch;

      const isBranchIncluded =
        new RegExp(`^${directory_name}`).test(commonPath) ||
        paths.some(path => new RegExp(`^${directory_name}`).test(path));

      if (!isBranchIncluded) {
        logger.info(`目录 "${directory_name}" (${responsible_person}) 不在提交的路径中，跳过检查`);
        continue;
      }

      logger.info({
        message: "找到匹配的目录",
        directory_name,
        responsible_person,
      });

      matchedBranches.push({ directory_name, responsible_person });
    }

    // 如果没有任何匹配的目录
    if (matchedBranches.length === 0) {
      logger.info("提交的文件不在匹配规则内");
      return { status: 200, message: "提交的文件不在匹配规则内" };
    }

    // 获取北京时间
    const beijingTime = moment.utc(push_timestamp).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss');

    // 遍历所有匹配的负责人，分别处理
    for (const { directory_name, responsible_person } of matchedBranches) {
      logger.info(`检测到负责人：${responsible_person}，准备发送 curl 请求`);

      // 构造写入文件的内容
      const content = `
通知接收者：${responsible_person}
1. 提交人：${user_name}
2. 提交时间：${beijingTime}
3. 提交日志：${message}
4. 提交文件名：${files.map(file => file.file).join(', ')}
5. 触发了哪个目录的规则：${directory_name}
`;

      // 将内容写入 responsible_person.txt 文件
      const filePath = `./responsible_person_${responsible_person}.txt`;
      fs.writeFile(filePath, content, (err) => {
        if (err) {
          logger.error({
            message: "写入 responsible_person.txt 文件失败",
            error: err.message,
          });
        } else {
          logger.info(`成功将负责人及相关信息写入文件 ${filePath}`);
        }
      });

      // 发送请求
      if (responsible_person) {
        await sendCurlRequest(responsible_person);
      }
    }

    // 所有匹配的目录都处理完后统一返回响应
    const dirNames = matchedBranches.map(b => `"${b.directory_name}"`).join(', ');
    return {
      status: 200,
      message: `提交被拒绝：目录 ${dirNames} 的规则已被触发，已通知对应负责人`
    };

  } catch (error) {
    logger.error({
      message: "处理 Web 钩子请求时发生错误",
      error: error.message,
    });
    return { status: 200, message: error.message };
  } finally {
    conn.release();
  }
}

// POST 路由处理函数
app.post('/', async (req, res) => {
  try {
    const body = req.body;
    logger.info({
      message: "收到请求体",
      body,
    });

    // 判断是否包含必要的字段
    if (body.user_name && body.operation_kind && Array.isArray(body.paths)) {
      // 处理 Web 钩子请求
      const result = await handleWebhookRequest(body);
      return res.status(result.status).json(result);
    } else {
      // 打印缺少的字段信息
      logger.info("请求体缺少必要字段：user_name, operation_kind 或 paths");
      return res.status(400).json({ status: 400, message: "请求体缺少必要字段：user_name, operation_kind 或 paths" });
    }
  } catch (error) {
    logger.error({
      message: "处理请求时发生错误",
      error: error.message,
    });
    return res.status(200).json({ status: 200, message: error.message });
  }
});

// 获取本机的 IPv4 地址
function getLocalIPv4Address() {
  const interfaces = os.networkInterfaces(); // 获取所有网络接口
  for (const interfaceName in interfaces) {
    const iface = interfaces[interfaceName];
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '127.0.0.1'; // 如果没有找到合适的 IPv4 地址，则返回 localhost
}

// 启动服务器
const server = app.listen(PORT, () => {
  const ip = getLocalIPv4Address(); // 获取本地 IPv4 地址
  const port = server.address().port;

  logger.info(`服务器已启动，监听地址：http://${ip}:${port}`);
});

// 简单处理程序终止信号以优雅地关闭服务器
process.on('SIGINT', async () => {
  logger.info("Shutting down server...");
  await pool.end(); // 异步关闭数据库连接池
  process.exit();
});