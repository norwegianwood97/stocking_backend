import { WebSocketServer } from 'ws';
import { prisma } from '../prisma/index.js';
export function setupWebSocketServerOrder(port) {
  const wss = new WebSocketServer({ port });

  wss.on('connection', async function connection(ws, req) {
    const requestUrl = new URL(req.url, `http://localhost:8090`); // 기본 URL을 제공해야 합니다.
    const companyId = Number(requestUrl.searchParams.get('companyId'));
    console.log('클라이언트가 연결되었습니다.');

    const getCurrentOrder = async () => {
      let priceResult = await prisma.company.findFirst({
        select: { currentPrice: true },
        where: { companyId: companyId },
      });

      if (priceResult) {
        let currentPrice = priceResult.currentPrice;
        let groupedOrders = await prisma.order.groupBy({
          by: ['type', 'price'], // type과 price로 그룹화합니다.
          where: {
            companyId: companyId,
            price: {
              gte: currentPrice - 50000,
              lte: currentPrice + 50000,
            },
          },
          _sum: {
            quantity: true, // 각 그룹의 quantity 합계를 계산합니다.
          },
          having: {
            quantity: {
              _sum: {
                gt: 0, // quantity 합계가 0보다 큰 그룹만 포함시킵니다. 필요에 따라 이 조건을 조정할 수 있습니다.
              },
            },
          },
        });
        groupedOrders.sort((a, b) => {
          if (a.price === b.price) {
            return a.type === 'sell' ? -1 : 1;
          }
          return b.price - a.price;
        });

        ws.send(JSON.stringify(groupedOrders));
      } else {
        console.log('Company not found or currentPrice is undefined');
        ws.send(JSON.stringify([])); // 또는 오류 메시지
      }
    };
    // 1초마다 가격 정보 전송
    const intervalId = setInterval(getCurrentOrder, 1000);
    // 클라이언트 연결이 끊어지면 인터벌 중지
    ws.on('close', () => {
      clearInterval(intervalId);
      console.log('클라이언트와의 연결이 끊겼습니다.');
    });
  });
}