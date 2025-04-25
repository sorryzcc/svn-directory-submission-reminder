const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise'); // 使用 promise 版本
const os = require('os'); // 用于获取网络接口信息

// 简单的日志实现
const logger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg) => console.error(`ERROR: ${msg}`),
};

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

// 处理 Web 钩子请求的函数
async function handleWebhookRequest(reqBody) {
  const { user_name, paths } = reqBody;

  // 打印完整的请求体内容，方便调试
  logger.info(`完整请求体内容：${JSON.stringify(reqBody)}`);

  // 检查 paths 是否存在
  if (!Array.isArray(paths) || paths.length === 0) {
    logger.info("paths 是空数组或无效数据");
    return { status: 200, message: "提交的文件不在匹配规则内" };
  }

  // 打印 paths 的详细信息
  logger.info(`paths 的类型是：${typeof paths}`);
  logger.info(`paths 是否是数组：${Array.isArray(paths)}`);
  logger.info(`paths 的内容：${JSON.stringify(paths)}`);

  // 获取公共路径
  const commonPath = getCommonPath(paths);

  // 如果没有提取到公共路径，直接返回“提交的文件不在匹配规则内”
  if (!commonPath) {
    logger.info("未能提取到公共路径，提交的文件不在匹配规则内");
    return { status: 200, message: "提交的文件不在匹配规则内" };
  }

  logger.info(`从 paths 提取的公共路径为：${commonPath}`);

  let conn;
  try {
    conn = await pool.getConnection();

    // 查询 SVN_directory_submission_reminder 表，获取所有目录信息
    const [branchRows] = await conn.execute('SELECT * FROM SVN_directory_submission_reminder');
    logger.info(`从数据库中查询到的目录信息：${JSON.stringify(branchRows)}`);

    let hasMatchingBranch = false; // 标记是否有匹配的目录

    for (const branch of branchRows) {
      const { directory_name, responsible_person } = branch;

      // 检查字段是否有效
      if (!directory_name || !responsible_person) {
        logger.warn(`无效的目录信息：directory_name=${directory_name}, responsible_person=${responsible_person}`);
        continue;
      }

      // 检查当前目录是否在公共路径或 paths 中
      const isBranchIncluded =
        commonPath.includes(directory_name) ||
        paths.some(path => path.includes(directory_name));

      if (!isBranchIncluded) {
        logger.info(`目录 "${directory_name}" (${responsible_person}) 不在提交的路径中，跳过检查`);
        continue; // 如果当前目录不在提交的路径中，跳过
      }

      hasMatchingBranch = true; // 标记有匹配的目录
      const safeResponsiblePerson = responsible_person.trim() || '未知负责人';
      logger.info(`找到匹配的目录 "${directory_name}"，对应的负责人是：${safeResponsiblePerson}`); // 打印出 responsible_person

      // 如果需要进一步处理（如锁定逻辑），可以在这里添加代码
      return { status: 500, message: `提交被拒绝：目录 "${directory_name}" (${safeResponsiblePerson}) 已锁定，且用户 "${user_name}" 不在白名单中。` };
    }

    // 如果没有任何匹配的目录，打印“提交的文件不在匹配规则内”
    if (!hasMatchingBranch) {
      logger.info("提交的文件不在匹配规则内");
      return { status: 200, message: "提交的文件不在匹配规则内" };
    }
  } catch (error) {
    logger.error(`处理 Web 钩子请求时发生错误：${error.message}`);
    return { status: 500, message: error.message };
  } finally {
    if (conn) {
      conn.release().catch(err => logger.error(`释放数据库连接失败：${err.message}`));
    }
  }
}

// POST 路由处理函数
app.post('/', async (req, res) => {
  try {
    const body = req.body;
    logger.info(`Received Request Body: ${JSON.stringify(body)}`);

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
    logger.error(`处理请求时发生错误：${error.message}`);
    return res.status(500).json({ status: 500, message: error.message });
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
  try {
    await pool.end(); // 异步关闭数据库连接池
  } catch (err) {
    logger.error(`关闭数据库连接池时发生错误：${err.message}`);
  }
  process.exit();
});