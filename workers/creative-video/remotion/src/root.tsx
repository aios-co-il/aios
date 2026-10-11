import React from 'react';
import {Composition} from 'remotion';
import {CarmenVideo, type CarmenVideoProps} from './video';
const demo: CarmenVideoProps = {
  title: 'CARMEN MARKETING OS',
  scenes: [
    {id:'sink',durationFrames:150,kind:'sink',caption:'העסק טובע בים של משימות שיווקיות?'},
    {id:'chaos',durationFrames:120,kind:'chaos',caption:'קמפיינים, ספקים, לידים ודוחות — הכול בנפרד'},
    {id:'arrival',durationFrames:180,kind:'arrival',caption:'הכירו את כרמן'},
    {id:'lift',durationFrames:180,kind:'lift',caption:'מחברים את כל השיווק למערכת אחת'},
    {id:'surface',durationFrames:150,kind:'surface',caption:'אסטרטגיה, ביצוע וצמיחה'},
    {id:'cta',durationFrames:150,kind:'cta',caption:'בואו נבנה יחד תוכנית שיווק לעסק שלכם'},
  ],
};
export const Root: React.FC = () => <Composition id="CarmenVideo" component={CarmenVideo} width={1080} height={1920} fps={30} durationInFrames={demo.scenes.reduce((n,s)=>n+s.durationFrames,0)} defaultProps={demo}/>;
