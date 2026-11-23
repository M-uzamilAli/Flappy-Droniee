export function connect(role, initialKey, onPacket, onState, resumeKey) {
  let key = initialKey, failures = 0, socket;
  function open() {
    onState(failures ? 'reconnecting' : 'connecting');
    socket = new WebSocket('wss://' + location.host + '/live');
    socket.onopen = () => socket.send(JSON.stringify({type:'join', role, key, resumeKey}));
    socket.onmessage = event => {
      const packet = JSON.parse(event.data);
      if (packet.type === 'joined') {
        key = packet.key ?? key;
        failures = 0;
        onState('connected');
      }
      onPacket(packet);
    };
    socket.onclose = event => {
      if ([4001,4003].includes(event.code)) {
        onState(event.reason);
        return;
      }
      onState('reconnecting');
      failures = Math.min(failures + 1, 4);
      setTimeout(open, Math.min(3000, 250 * 2 ** failures));
    };
  }
  open();
  return packet => {
    if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 8192) {
      socket.send(JSON.stringify(packet));
    }
  };
}
