import forestUrl from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Nackgroud/Backgroud (5).png?url';
import hillsUrl from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Nackgroud/Backgroud (4).png?url';
import mountainsUrl from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Nackgroud/Backgroud (2).png?url';
import palm1Url from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/tree/tree1.png?url';
import palm2Url from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Prop/tree/tree2.png?url';
import ruinsUrl from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Nackgroud/Backgroud (3).png?url';
import skyUrl from '../../../graphics/Cozy Ancient Desert Nigth Ruins – 2D Pixel Art Platformer Asset Pack/Nackgroud/Backgroud (1).png?url';

export const DESERT_TEXTURES = {
  sky: 'desert-sky',
  mountains: 'desert-mountains',
  ruins: 'desert-ruins',
  hills: 'desert-hills',
  forest: 'desert-forest',
  palm1: 'desert-palm-1',
  palm2: 'desert-palm-2',
} as const;

export const DESERT_IMAGES = {
  sky: skyUrl,
  mountains: mountainsUrl,
  ruins: ruinsUrl,
  hills: hillsUrl,
  forest: forestUrl,
  palm1: palm1Url,
  palm2: palm2Url,
} as const;

/** Source background size, from the pack. */
export const DESERT_BG_WIDTH = 480;
export const DESERT_BG_HEIGHT = 256;
