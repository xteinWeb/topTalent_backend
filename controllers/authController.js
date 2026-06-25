// POST login handler
exports.login = (req, res) => {
  const { username, password } = req.body;
  
  const expectedUser = process.env.ADMIN_USER || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || 'admin';
  
  if (username === expectedUser && password === expectedPass) {
    res.json({
      success: true,
      token: 'artdecon-jwt-mock-token-secure-12345',
      user: {
        username: username,
        role: 'Administrator'
      }
    });
  } else {
    res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
};
