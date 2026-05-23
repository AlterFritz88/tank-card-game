import prototypeTankImage from "../assets/tanks/prototype-tank.png";

const tankImageModules = import.meta.glob("../assets/tanks/units/*.{png,jpg,jpeg,webp}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const tankImagesByCardId: Record<string, string> = {};

for (const [path, imageUrl] of Object.entries(tankImageModules)) {
  const fileName = path.split("/").pop();

  if (!fileName) continue;

  const cardId = fileName.replace(/\.(png|jpg|jpeg|webp)$/i, "");

  tankImagesByCardId[cardId] = imageUrl;
}

export function getTankImage(cardId: string): string {
  return tankImagesByCardId[cardId] ?? prototypeTankImage;
}