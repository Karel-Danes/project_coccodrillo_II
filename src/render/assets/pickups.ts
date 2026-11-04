import heart1 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coração/coração 1.png?url';
import heart2 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coração/coração 2.png?url';
import heart3 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coração/coração 3.png?url';
import heart4 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coração/coração 4.png?url';
import heart5 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coração/coração 5.png?url';
import heart6 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coração/coração 6.png?url';
import heart7 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coração/coração 7.png?url';
import heart8 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coração/coração 8.png?url';
import coin1 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coin/coin1.png?url';
import coin2 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coin/coin2.png?url';
import coin3 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coin/coin3.png?url';
import coin4 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coin/coin4.png?url';
import coin5 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coin/coin5.png?url';
import coin6 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coin/coin6.png?url';
import coin7 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coin/coin7.png?url';
import coin8 from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/Coin/coin8.png?url';

export const HEART_URLS = [
  heart1,
  heart2,
  heart3,
  heart4,
  heart5,
  heart6,
  heart7,
  heart8,
] as const;

export const COIN_URLS = [
  coin1,
  coin2,
  coin3,
  coin4,
  coin5,
  coin6,
  coin7,
  coin8,
] as const;

export const HEART_KEYS = HEART_URLS.map((_, index) => `pickup-heart-${index}`);
export const COIN_KEYS = COIN_URLS.map((_, index) => `pickup-coin-${index}`);
