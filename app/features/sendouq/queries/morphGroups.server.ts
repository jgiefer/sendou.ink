import { nanoid } from "nanoid";
import { sql } from "~/db/sql";
import { deleteLikesByGroupId } from "./deleteLikesByGroupId.server";

const deleteGroupStm = sql.prepare(/* sql */ `
  delete from "Group"
  where "Group"."id" = @groupId
`);

const deleteGroupMapsStm = sql.prepare(/* sql */ `
  delete from "MapPoolMap"
    where "groupId" = @groupId
`);

const addGroupMemberStm = sql.prepare(/* sql */ `
  insert into "GroupMember" ("groupId", "userId", "role")
  values (@groupId, @userId, @role)
`);

const updateGroupStm = sql.prepare(/* sql */ `
  update "Group"
  set "chatCode" = @chatCode
  where "id" = @groupId
`);

export const morphGroups = sql.transaction(
  ({
    survivingGroupId,
    otherGroupId,
    newMembers,
    addChatCode,
  }: {
    survivingGroupId: number;
    otherGroupId: number;
    newMembers: number[];
    addChatCode: boolean;
  }) => {
    deleteGroupStm.run({ groupId: otherGroupId });
    deleteGroupMapsStm.run({ groupId: otherGroupId });

    deleteLikesByGroupId(survivingGroupId);

    // reset chat code so previous messages are not visible
    if (addChatCode) {
      updateGroupStm.run({
        groupId: survivingGroupId,
        chatCode: nanoid(10),
      });
    }

    for (const userId of newMembers) {
      addGroupMemberStm.run({
        groupId: survivingGroupId,
        userId,
        role: "REGULAR",
      });
    }
  },
);
