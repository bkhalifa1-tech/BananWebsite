import {z} from 'zod';
import type {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {questionSchema} from '../practice';
import {ownedRouter,type UserLookup} from '../owned';
export const generatedStudy=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('flashcards'),title:z.string().trim().min(2).max(100),cards:z.array(z.object({front:z.string().trim().min(1).max(4000),back:z.string().trim().min(1).max(8000),topic:z.string().max(100).default('')}).strict()).min(1).max(20)}).strict(),
 z.object({kind:z.literal('quiz'),title:z.string().trim().min(2).max(100),questions:z.array(questionSchema).min(1).max(20)}).strict()
]);
export function parseGeneratedStudy(text:string,action:string){const body=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');const d=generatedStudy.parse(JSON.parse(body));if(d.kind!==(action==='flashcards'?'flashcards':'quiz'))throw new Error('Wrong generated type');return d;}
export function generationRoutes(db:DatabaseSync,userFor:UserLookup,verified=false){const r=ownedRouter(db,userFor,verified);
 r.get('/courses/:id/generated-study',(_q,res)=>res.json(db.prepare('SELECT id,action,source,data,imported_id,created_at FROM ai_generations WHERE user_id=? AND course_id=? ORDER BY created_at DESC LIMIT 50').all(res.locals.userId,res.locals.courseId).map(a=>({...a,data:JSON.parse(String(a.data))}))));
 r.post('/generated-study/:id/import',(q,res)=>{const a=db.prepare('SELECT * FROM ai_generations WHERE id=? AND user_id=?').get(q.params.id,res.locals.userId);if(!a){res.status(404).json({error:'Generated study item not found.'});return;}if(a.imported_id){res.json({id:a.imported_id});return;}const d=generatedStudy.parse(JSON.parse(String(a.data))),id=randomUUID();db.exec('BEGIN');try{if(d.kind==='flashcards'){db.prepare('INSERT INTO flashcard_decks VALUES(?,?,?,?)').run(id,res.locals.userId,a.course_id,d.title);for(const c of d.cards)db.prepare('INSERT INTO flashcards(id,deck_id,front,back,topic,source) VALUES(?,?,?,?,?,?)').run(randomUUID(),id,c.front,c.back,c.topic,a.source);}else{db.prepare('INSERT INTO quizzes VALUES(?,?,?,?)').run(id,res.locals.userId,a.course_id,d.title);d.questions.forEach((v,i)=>db.prepare('INSERT INTO questions VALUES(?,?,?,?,?,?,?,?,?,?)').run(randomUUID(),id,v.kind,v.prompt,JSON.stringify(v.options),v.correct_answer,v.explanation,v.topic,a.source,i));}db.prepare('UPDATE ai_generations SET imported_id=? WHERE id=?').run(id,a.id);db.exec('COMMIT');res.status(201).json({id});}catch(e){db.exec('ROLLBACK');throw e;}});return r;}
