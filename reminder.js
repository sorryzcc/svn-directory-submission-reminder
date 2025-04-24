const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise'); // 使用 promise 版本
const os = require('os'); // 用于获取网络接口信息
const logger = require('./logger.js')

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

// 处理 Web 钩子请求的函数
async function handleWebhookRequest(reqBody) {
  const { user_name, paths } = reqBody;

  const conn = await pool.getConnection();
  try {
    // 查询 SVN_directory_submission_reminder 表，获取所有目录信息
    const [branchRows] = await conn.execute('SELECT * FROM SVN_directory_submission_reminder');
    logger.info(`从数据库中查询到的目录信息：${JSON.stringify(branchRows)}`);

    let hasMatchingBranch = false; // 标记是否有匹配的目录

    for (const branch of branchRows) {
      const {
        directory_name,
        responsible_person
      } = branch;

      logger.info(`正在检查目录 "${directory_name}" 是否匹配 paths: ${JSON.stringify(paths)}`);

      // 检查当前目录是否在请求的 paths 中
      const isBranchIncluded = paths.some(path => path.includes(directory_name));
      if (!isBranchIncluded) {
        logger.info(`目录 "${directory_name}" (${responsible_person}) 不在请求的 paths 中，跳过检查`);
        continue; // 如果当前目录不在请求的 paths 中，跳过
      }

      hasMatchingBranch = true; // 标记有匹配的目录
      logger.info(`找到匹配的目录 "${directory_name}"，对应的负责人是：${responsible_person}`); // 打印出 responsible_person

      // 如果需要进一步处理（如锁定逻辑），可以在这里添加代码
      return { status: 500, message: `提交被拒绝：目录 "${directory_name}" (${responsible_person}) 已锁定，且用户 "${user_name}" 不在白名单中。` };
    }

    // 如果没有任何匹配的目录，直接允许提交
    if (!hasMatchingBranch) {
      logger.info("没有对应的目录");
      return { status: 200, message: "No matching branches found, allowing commit." };
    }
  } catch (error) {
    logger.error(`处理 Web 钩子请求时发生错误：${error.message}`);
    return { status: 500, message: error.message };
  } finally {
    conn.release();
  }
}

// POST 路由处理函数
app.post('/', async (req, res) => {
  try {
    const body = req.body;
    logger.info(`Received Request Body: ${JSON.stringify(body)}`);

    // 判断是 post-commit 钩子请求
    if (body.user_name && body.operation_kind && body.event_type === 'svn_post_commit') {
      // 处理 Web 钩子请求
      const result = await handleWebhookRequest(body);
      return res.status(result.status).json(result);
    } else {
      // 未知请求类型
      return res.status(200).json({ status: 200, message: "Unknown request type." });
    }
  } catch (error) {
    logger.error(error.message);
    return res.status(500).json({ status: 500, message: error.message });
  }
});

// 处理 Web 钩子请求的函数
async function handleWebhookRequest(reqBody) {
  const { user_name, paths } = reqBody;

  // 如果 paths 是空数组，直接返回“没有匹配到任何目录”
  if (!Array.isArray(paths) || paths.length === 0) {
    logger.info("paths 是空数组，没有匹配到任何目录");
    return { status: 200, message: "paths 是空数组，没有匹配到任何目录" };
  }

  const conn = await pool.getConnection();
  try {
    // 查询 SVN_directory_submission_reminder 表，获取所有目录信息
    const [branchRows] = await conn.execute('SELECT * FROM SVN_directory_submission_reminder');
    logger.info(`从数据库中查询到的目录信息：${JSON.stringify(branchRows)}`);

    let hasMatchingBranch = false; // 标记是否有匹配的目录

    for (const branch of branchRows) {
      const {
        directory_name,
        responsible_person
      } = branch;

      logger.info(`正在检查目录 "${directory_name}" 是否匹配 paths: ${JSON.stringify(paths)}`);

      // 检查当前目录是否在请求的 paths 中
      const isBranchIncluded = paths.some(path => path.includes(directory_name));
      if (!isBranchIncluded) {
        logger.info(`目录 "${directory_name}" (${responsible_person}) 不在请求的 paths 中，跳过检查`);
        continue; // 如果当前目录不在请求的 paths 中，跳过
      }

      hasMatchingBranch = true; // 标记有匹配的目录
      logger.info(`找到匹配的目录 "${directory_name}"，对应的负责人是：${responsible_person}`); // 打印出 responsible_person

      // 如果需要进一步处理（如锁定逻辑），可以在这里添加代码
      return { status: 500, message: `提交被拒绝：目录 "${directory_name}" (${responsible_person}) 已锁定，且用户 "${user_name}" 不在白名单中。` };
    }

    // 如果没有任何匹配的目录，直接允许提交
    if (!hasMatchingBranch) {
      logger.info("没有匹配到任何目录");
      return { status: 200, message: "没有匹配到任何目录" };
    }
  } catch (error) {
    logger.error(`处理 Web 钩子请求时发生错误：${error.message}`);
    return { status: 500, message: error.message };
  } finally {
    conn.release();
  }
}

// 处理 Web 钩子请求的函数
async function handleWebhookRequest(reqBody) {
  const { user_name, paths } = reqBody;

  const conn = await pool.getConnection();
  try {
    // 查询 SVN_directory_submission_reminder 表，获取所有目录信息
    const [branchRows] = await conn.execute('SELECT * FROM SVN_directory_submission_reminder');
    logger.info(`从数据库中查询到的目录信息：${JSON.stringify(branchRows)}`);

    let hasMatchingBranch = false; // 标记是否有匹配的目录

    for (const branch of branchRows) {
      const {
        directory_name,
        responsible_person
      } = branch;

      // 检查当前目录是否在请求的 paths 中
      const isBranchIncluded = paths.some(path => path.includes(directory_name));
      if (!isBranchIncluded) {
        logger.info(`目录 "${directory_name}" (${responsible_person}) 不在请求的 paths 中，跳过检查`);
        continue; // 如果当前目录不在请求的 paths 中，跳过
      }

      hasMatchingBranch = true; // 标记有匹配的目录
      logger.info(`找到匹配的目录 "${directory_name}"，对应的负责人是：${responsible_person}`); // 打印出 responsible_person

      // 如果需要进一步处理（如锁定逻辑），可以在这里添加代码
      return { status: 500, message: `提交被拒绝：目录 "${directory_name}" (${responsible_person}) 已锁定，且用户 "${user_name}" 不在白名单中。` };
    }

    // 如果没有任何匹配的目录，直接允许提交
    if (!hasMatchingBranch) {
      logger.info("没有对应的目录");
      return { status: 200, message: "No matching branches found, allowing commit." };
    }
  } catch (error) {
    logger.error(`处理 Web 钩子请求时发生错误：${error.message}`);
    return { status: 500, message: error.message };
  } finally {
    conn.release();
  }
}

// 获取本机的 IPv4 地址
function getLocalIPv4Address() {
  const interfaces = os.networkInterfaces(); // 获取所有网络接口
  for (const interfaceName in interfaces) {
    const iface = interfaces[interfaceName];
    for (const responsible_person of iface) {
      if (responsible_person.family === 'IPv4' && !responsible_person.internal) {
        return responsible_person.address;
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