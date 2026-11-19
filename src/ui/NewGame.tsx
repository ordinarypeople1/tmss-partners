import { useGame } from "./game";

/** The dialog that starts a new game: difficulty and era. */
export function NewGame({ onClose }: { onClose: () => void }) {
  const game = useGame();
  game.newGame();
  onClose();
  return null;
}
