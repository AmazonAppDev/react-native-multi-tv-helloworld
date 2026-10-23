import type {ImageSourcePropType} from 'react-native';

export type PersonaId = 'mother' | 'father';

export interface Persona {
  id: PersonaId;
  displayName: string;
  nameThai: string;
  nameLatin: string;
  image: ImageSourcePropType;
}

/**
 * The two guardian voices, mirroring the production steward page.
 * Voice ids live server side; the TV only needs the public mp3 slugs.
 */
export const PERSONAS: Record<PersonaId, Persona> = {
  mother: {
    id: 'mother',
    displayName: 'Mother Tree',
    nameThai: 'แค-นา',
    nameLatin: 'Kae Na',
    image: require('../../assets/brand/guardian-kae-na.png'),
  },
  father: {
    id: 'father',
    displayName: 'Father Tree',
    nameThai: 'ยางนา',
    nameLatin: 'Yang Na',
    image: require('../../assets/brand/guardian-yang-na.png'),
  },
};

export interface MeditationCue {
  persona: PersonaId;
  text: string;
}

/** Every recorded turn, exactly as written and voiced in production. */
export const MEDITATION_CUES: Record<string, MeditationCue> = {
  meditation_ground_1: {
    persona: 'mother',
    text: 'Sit however your body is comfortable. Let the ground take your weight. I am แค-นา, and I have stood in this soil a long time. Nothing you feel here needs to be fixed.',
  },
  meditation_ground_2: {
    persona: 'mother',
    text: 'Breathe in through your nose, slowly. Let the breath travel all the way down, past your chest. Then let it leave on its own. You do not have to push it out.',
  },
  meditation_ground_3: {
    persona: 'mother',
    text: 'Notice where your body touches the earth. Your feet. Your seat. Your hands. That contact is real. The forest is holding you the way it holds me.',
  },
  meditation_ground_4: {
    persona: 'mother',
    text: 'Open your eyes when you are ready. Nothing was asked of you here. Carry this quiet gently. I am แค-นา, and I am still here.',
  },
  meditation_release_1: {
    persona: 'father',
    text: 'I am ยางนา. Sit still a moment, and let the day finish arriving. You do not have to sort any of it out yet.',
  },
  meditation_release_2: {
    persona: 'father',
    text: 'Now find the one thing you are carrying. Do not name it. Just notice where you feel it in your body.',
  },
  meditation_release_3: {
    persona: 'father',
    text: 'Breathe toward that place. On the out-breath, let a little of it go. Not all of it. A little is enough.',
  },
  meditation_release_4: {
    persona: 'father',
    text: 'Stay with the smaller weight. It will still be there later, and you will meet it stronger for the waiting. I am ยางนา. Rest a while.',
  },
  meditation_together_1: {
    persona: 'mother',
    text: 'I am แค-นา, the mother tree of this grove. I will begin.',
  },
  meditation_together_2: {
    persona: 'father',
    text: 'And I am ยางนา, who stands beside her. We are two trees, and one canopy.',
  },
  meditation_together_3: {
    persona: 'mother',
    text: 'Let the two of us breathe with you. In, and out. There is no hurry in a forest. Nothing here is late.',
  },
  meditation_together_4: {
    persona: 'father',
    text: 'When you are ready, come back. The grove stays open. We will be here when you return.',
  },
  meditation_ten_1: {
    persona: 'mother',
    text: 'Sit however your body is comfortable. Let the ground take your weight. I am แค-นา, and I have stood in this soil a long time. You do not have to do this well. There is nothing to get right.',
  },
  meditation_ten_2: {
    persona: 'mother',
    text: 'Let the air come in through your nose, slow and low. Let it leave on its own. You do not have to push it out. There is no number to reach. Just this one breath, and the one after it.',
  },
  meditation_ten_3: {
    persona: 'mother',
    text: 'The rain lands first on the crown of a tree, the highest place. On you, that is the very top of your head. Let that be the first place you rest.',
  },
  meditation_ten_4: {
    persona: 'mother',
    text: 'Now let the water run down, the way it runs off a leaf. Let it reach your forehead, and let your forehead go smooth. Let your eyes soften, and your jaw hang loose. Nothing is asked of your face.',
  },
  meditation_ten_5: {
    persona: 'mother',
    text: 'Come back to your breath. Feel your chest widen as it comes in. Let it fall away as it goes out. Do not steer it. If your mind drifts, that is what minds do. Come back. The coming back is the practice.',
  },
  meditation_ten_6: {
    persona: 'mother',
    text: 'Your belly is next. It is the trunk of you, the centre. Feel it widen as you breathe in, and fall as you breathe out. Do not make it happen. Let the breath do the work.',
  },
  meditation_ten_7: {
    persona: 'mother',
    text: 'Now the lowest place, where a tree meets the ground. Feel your hips, and the sitting bone beneath you. Feel your legs, heavy now. Feel your feet, and the floor under them. That grip is real. The forest is holding you the way it holds me.',
  },
  meditation_ten_8: {
    persona: 'father',
    text: 'I am ยางนา, who stands beside her. When you are ready, come back. Nothing was asked of you here. Carry this quiet gently. The grove stays open.',
  },
  meditation_fifteen_1: {
    persona: 'mother',
    text: 'Sit however your body is comfortable. Let the ground take your weight. I am แค-นา, and I have stood in this soil a long time. You do not have to do this well. There is nothing to get right.',
  },
  meditation_fifteen_2: {
    persona: 'mother',
    text: 'Let the air come in through your nose, slow and long. Let it travel down, past your chest. Let it leave on its own. You do not have to push it out. There is no number to reach. Just this one breath, and the one after it.',
  },
  meditation_fifteen_3: {
    persona: 'mother',
    text: 'The rain lands first on the crown of a tree, the highest place. On you, that is the very top of your head. Let that be the first place you rest. Now let the water run down, the way it runs off a leaf, into your forehead. Let your forehead go smooth. Nothing is asked of it.',
  },
  meditation_fifteen_4: {
    persona: 'mother',
    text: 'Let the water reach your eyes. Let them soften, open or closed. Let it run to your jaw, and let the jaw hang, unheld. Then your shoulders. Let them fall away from your ears. You may not have noticed you were carrying them. You can put them down.',
  },
  meditation_fifteen_5: {
    persona: 'mother',
    text: 'Feel your chest widen as the breath comes in, and settle as it goes out. Let the breath run down your arms, all the way into your hands. Feel your hands, wherever they are resting. Now your belly, the centre of you. Feel it widen and fall on its own.',
  },
  meditation_fifteen_6: {
    persona: 'mother',
    text: 'Now the lowest place, where a tree meets the ground. This is where the sitting happens. Feel your hips, and the sitting bone beneath you. Feel your legs, heavy now. Feel your feet. That grip is real. The forest is holding you the way it holds me.',
  },
  meditation_fifteen_7: {
    persona: 'mother',
    text: 'Let the map go. Feel your whole body at once, sitting here. You are not only in a room. You are in a watershed, and it is raining somewhere in it now. There is no hurry in a forest. Nothing here is late.',
  },
  meditation_fifteen_8: {
    persona: 'father',
    text: 'I am ยางนา, who stands beside her. When you are ready, come back. Nothing was asked of you here. Carry this quiet gently. The grove stays open.',
  },
  meditation_thirty_1: {
    persona: 'mother',
    text: 'I am แค-นา, the mother tree of this grove. I will begin. Sit however your body is comfortable. Let the ground take your weight.',
  },
  meditation_thirty_2: {
    persona: 'father',
    text: 'And I am ยางนา, who stands beside her. We are two trees, and one canopy. Sit still a moment, and let the day finish arriving. You do not have to sort any of it out yet.',
  },
  meditation_thirty_3: {
    persona: 'father',
    text: 'Let the air come in through your nose, slow and long. Let it leave on its own. You do not have to push it out. Do not steer the breath. Just feel it come, and feel it go. If your mind wanders, that is what minds do. Come back without scolding yourself.',
  },
  meditation_thirty_4: {
    persona: 'mother',
    text: 'The rain lands first on the crown of a tree, the highest place. On you, that is the very top of your head. Let that be the first place you rest. Now let the water run down, the way it runs off a leaf, into your forehead. Let your forehead go smooth. Let your eyes soften, open or closed. Let your face go quiet. Nothing is asked of it.',
  },
  meditation_thirty_5: {
    persona: 'mother',
    text: 'Let the water reach your jaw. Let it hang, unheld. Let it run to your throat, and the back of your neck. Let the neck lengthen. Then your shoulders. Let them fall away from your ears. You may not have noticed you were carrying them. You can put them down.',
  },
  meditation_thirty_6: {
    persona: 'mother',
    text: 'Feel your chest widen as the breath comes in, and settle as it goes out. Let the breath run down your arms, slowly, all the way into your hands. Feel your hands, wherever they are resting. Feel the ends of your fingers. There is nothing for your hands to do right now.',
  },
  meditation_thirty_7: {
    persona: 'father',
    text: 'Your belly is next. It is the trunk of you, the centre. Feel it widen as the breath comes in, and fall as it goes out. Do not make it happen. Let the breath do the work. Stay here a while. This is the whole practice, and it is enough.',
  },
  meditation_thirty_8: {
    persona: 'mother',
    text: 'Now the back of you, the far side of the trunk. Feel your spine, holding you upright without being asked. Let your hips settle. Let them be heavy. The earth is under all of this. It has not moved.',
  },
  meditation_thirty_9: {
    persona: 'mother',
    text: 'Now the lowest place, where a tree meets the ground. This is where the sitting happens. Feel your hips, and the sitting bone beneath you. Feel your legs, heavy now. Feel your feet, and the floor under them. That grip is real. The forest is holding you the way it holds me.',
  },
  meditation_thirty_10: {
    persona: 'mother',
    text: 'Let the map go. Feel your whole body at once, sitting here. You are not only in a room. You are in a watershed, and it is raining somewhere in it now. You are one tree in a grove of trees, and none of us are in a hurry.',
  },
  meditation_thirty_11: {
    persona: 'mother',
    text: 'Let the two of us breathe with you. In, and out. Whatever you are carrying will still be there later. It is safe to set it down for now.',
  },
  meditation_thirty_12: {
    persona: 'father',
    text: 'There is no hurry in a forest. Nothing here is late. Stay here, as long as it lasts.',
  },
  meditation_thirty_13: {
    persona: 'father',
    text: 'When you are ready, come back. Feel the ground under you again. Move your hands if you like. Nothing was asked of you here. Carry this quiet gently. The grove stays open. We will be here when you return.',
  },
};

export interface MeditationTurn {
  tag: string;
  pauseSeconds: number;
}

export interface MeditationGuide {
  id: string;
  title: string;
  subtitle: string;
  guide: PersonaId;
  turns: MeditationTurn[];
}

export const MEDITATION_GUIDES: MeditationGuide[] = [
  {
    id: 'grounding',
    title: 'Grounding in the Soil',
    subtitle: 'Let the earth take your weight, one breath at a time.',
    guide: 'mother',
    turns: [
      {tag: 'meditation_ground_1', pauseSeconds: 6},
      {tag: 'meditation_ground_2', pauseSeconds: 8},
      {tag: 'meditation_ground_3', pauseSeconds: 8},
      {tag: 'meditation_ground_4', pauseSeconds: 4},
    ],
  },
  {
    id: 'release',
    title: 'Releasing the Weight',
    subtitle: 'Set down what you are carrying, without having to finish it.',
    guide: 'father',
    turns: [
      {tag: 'meditation_release_1', pauseSeconds: 6},
      {tag: 'meditation_release_2', pauseSeconds: 8},
      {tag: 'meditation_release_3', pauseSeconds: 10},
      {tag: 'meditation_release_4', pauseSeconds: 4},
    ],
  },
  {
    id: 'together',
    title: 'The Two Trees Together',
    subtitle: 'แค-นา and ยางนา breathe with you, turn by turn.',
    guide: 'mother',
    turns: [
      {tag: 'meditation_together_1', pauseSeconds: 6},
      {tag: 'meditation_together_2', pauseSeconds: 8},
      {tag: 'meditation_together_3', pauseSeconds: 10},
      {tag: 'meditation_together_4', pauseSeconds: 4},
    ],
  },
  {
    id: 'ten',
    title: 'Ten Minutes — Rain on the Tree',
    subtitle: 'แค-นา follows the rain from crown to roots; ยางนา closes.',
    guide: 'mother',
    turns: [
      {tag: 'meditation_ten_1', pauseSeconds: 44},
      {tag: 'meditation_ten_2', pauseSeconds: 74},
      {tag: 'meditation_ten_3', pauseSeconds: 48},
      {tag: 'meditation_ten_4', pauseSeconds: 44},
      {tag: 'meditation_ten_5', pauseSeconds: 73},
      {tag: 'meditation_ten_6', pauseSeconds: 76},
      {tag: 'meditation_ten_7', pauseSeconds: 72},
      {tag: 'meditation_ten_8', pauseSeconds: 49},
    ],
  },
  {
    id: 'fifteen',
    title: 'Fifteen Minutes — Down to the Roots',
    subtitle: 'แค-นา carries the rain through face, hands and belly to the ground.',
    guide: 'mother',
    turns: [
      {tag: 'meditation_fifteen_1', pauseSeconds: 74},
      {tag: 'meditation_fifteen_2', pauseSeconds: 101},
      {tag: 'meditation_fifteen_3', pauseSeconds: 97},
      {tag: 'meditation_fifteen_4', pauseSeconds: 101},
      {tag: 'meditation_fifteen_5', pauseSeconds: 130},
      {tag: 'meditation_fifteen_6', pauseSeconds: 131},
      {tag: 'meditation_fifteen_7', pauseSeconds: 73},
      {tag: 'meditation_fifteen_8', pauseSeconds: 49},
    ],
  },
  {
    id: 'thirty',
    title: 'Thirty Minutes — The Whole Grove',
    subtitle:
      'แค-นา and ยางนา take turns, from the first breath to the far side of the trunk.',
    guide: 'mother',
    turns: [
      {tag: 'meditation_thirty_1', pauseSeconds: 50},
      {tag: 'meditation_thirty_2', pauseSeconds: 46},
      {tag: 'meditation_thirty_3', pauseSeconds: 159},
      {tag: 'meditation_thirty_4', pauseSeconds: 152},
      {tag: 'meditation_thirty_5', pauseSeconds: 160},
      {tag: 'meditation_thirty_6', pauseSeconds: 159},
      {tag: 'meditation_thirty_7', pauseSeconds: 190},
      {tag: 'meditation_thirty_8', pauseSeconds: 164},
      {tag: 'meditation_thirty_9', pauseSeconds: 159},
      {tag: 'meditation_thirty_10', pauseSeconds: 160},
      {tag: 'meditation_thirty_11', pauseSeconds: 48},
      {tag: 'meditation_thirty_12', pauseSeconds: 53},
      {tag: 'meditation_thirty_13', pauseSeconds: 74},
    ],
  },
];

const VOICE_BASE = 'https://globie.earth';

export const turnPersona = (turn: MeditationTurn): PersonaId =>
  MEDITATION_CUES[turn.tag].persona;

export const turnText = (turn: MeditationTurn): string =>
  MEDITATION_CUES[turn.tag].text;

export const turnUrl = (turn: MeditationTurn): string =>
  `${VOICE_BASE}/voice/${turnPersona(turn)}--${turn.tag}.mp3`;

export const breathCueUrl = (
  persona: PersonaId,
  phase: 'inhale' | 'hold' | 'exhale',
): string => `${VOICE_BASE}/voice/${persona}--breath_${phase}.mp3`;

export const BREATH_CUE_TEXT = {
  inhale: 'Breathe in, slowly.',
  hold: 'Hold, gently.',
  exhale: 'And breathe out.',
} as const;

export const REST_CUE_TEXT = 'Rest, and let it settle.';

/** Mirrors the web estimate: about 2.5 words a second, plus each pause. */
export const guideSeconds = (guide: MeditationGuide): number =>
  guide.turns.reduce((total, turn) => {
    const words = MEDITATION_CUES[turn.tag].text.trim().split(/\s+/).length;
    return total + Math.max(6, Math.round(words / 2.5)) + turn.pauseSeconds;
  }, 0);

export const guideMinutes = (guide: MeditationGuide): number =>
  Math.max(1, Math.round(guideSeconds(guide) / 60));
