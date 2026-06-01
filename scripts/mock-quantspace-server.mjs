import http from 'http';

const PORT = 9999;
const mockBlob = {
  strategy: "Fama-French Tech Tilt",
  weights: {
    "AAPL": 0.25,
    "NVDA": 0.35,
    "MSFT": 0.20,
    "TSLA": 0.10,
    "AMD": 0.10
  },
  metrics: {
    sharpe: 1.45,
    drawdown: 0.12,
    annual_return: 0.28
  }
};

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(mockBlob));
});

server.listen(PORT, () => {
  console.log(`Mock QuantSpace Blob Server running at http://localhost:${PORT}/portfolio.json`);
});
