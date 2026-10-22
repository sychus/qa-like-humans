import { useEffect, useRef } from 'react';
import { OfficeGame } from '../game/OfficeGame.ts';

export function OfficeCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const game = new OfficeGame(canvasRef.current!);
    game.start();
    return () => game.destroy();
  }, []);

  return (
    <div className="office">
      <canvas ref={canvasRef} />
    </div>
  );
}
