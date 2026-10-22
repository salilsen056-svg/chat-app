import {db,newId} from './database.mjs';
export const groups={
 async list(userId){return(await(await db()).query('SELECT g.*, (SELECT count(*)::int FROM group_members m WHERE m."groupId"=g.id) AS "memberCount" FROM chat_groups g JOIN group_members m ON m."groupId"=g.id WHERE m."userId"=$1 ORDER BY g."createdAt" DESC',[userId])).rows;},
 async member(groupId,userId){return Boolean((await(await db()).query('SELECT 1 FROM group_members WHERE "groupId"=$1 AND "userId"=$2',[groupId,userId])).rowCount);},
 async create(ownerId,name,members){const c=await(await db()).connect();try{await c.query('BEGIN');
  const allowed=(await c.query('SELECT "contactId" FROM contacts WHERE "ownerId"=$1 AND "contactId"=ANY($2::text[]) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b."ownerId"=$1 AND b."blockedId"=contacts."contactId") OR (b."blockedId"=$1 AND b."ownerId"=contacts."contactId"))',[ownerId,members])).rows;
  if(allowed.length!==members.length)throw Error('Choose saved contacts who are available.');
  const id=newId();await c.query('INSERT INTO chat_groups(id,name,"ownerId") VALUES($1,$2,$3)',[id,name,ownerId]);
  for(const userId of [ownerId,...members])await c.query('INSERT INTO group_members("groupId","userId") VALUES($1,$2)',[id,userId]);
  await c.query('COMMIT');return{id,name,ownerId,memberCount:members.length+1};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}},
 async history(groupId,userId){return(await(await db()).query('SELECT * FROM (SELECT m.*,u.name AS "senderName" FROM group_messages m JOIN users u ON u.id=m."from" WHERE m."groupId"=$1 AND EXISTS(SELECT 1 FROM group_members gm WHERE gm."groupId"=$1 AND gm."userId"=$2) ORDER BY m."createdAt" DESC,m.id DESC LIMIT 100) recent ORDER BY "createdAt",id',[groupId,userId])).rows;},
 async send(groupId,userId,text){return(await(await db()).query('INSERT INTO group_messages(id,"groupId","from",text) SELECT $1,$2,$3,$4 WHERE EXISTS(SELECT 1 FROM group_members WHERE "groupId"=$2 AND "userId"=$3) RETURNING *',[newId(),groupId,userId,text])).rows[0];},
 async leave(groupId,userId){const c=await(await db()).connect();try{await c.query('BEGIN');const group=(await c.query('SELECT * FROM chat_groups WHERE id=$1 FOR UPDATE',[groupId])).rows[0];if(!group){await c.query('COMMIT');return;}
  await c.query('DELETE FROM group_members WHERE "groupId"=$1 AND "userId"=$2',[groupId,userId]);const next=(await c.query('SELECT "userId" FROM group_members WHERE "groupId"=$1 ORDER BY "userId" LIMIT 1',[groupId])).rows[0];
  if(!next)await c.query('DELETE FROM chat_groups WHERE id=$1',[groupId]);else if(group.ownerId===userId)await c.query('UPDATE chat_groups SET "ownerId"=$2 WHERE id=$1',[groupId,next.userId]);await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
};
