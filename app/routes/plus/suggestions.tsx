import type {
  ActionFunction,
  LinksFunction,
  LoaderFunction,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import invariant from "tiny-invariant";
import { z } from "zod";
import { Avatar } from "~/components/Avatar";
import { Button, LinkButton } from "~/components/Button";
import { Catcher } from "~/components/Catcher";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { TrashIcon } from "~/components/icons/Trash";
import { upcomingVoting } from "~/core/plus";
import { db } from "~/db";
import type * as plusSuggestions from "~/db/models/plusSuggestions.server";
import type { PlusSuggestion } from "~/db/types";
import { useUser } from "~/hooks/useUser";
import {
  canAddCommentToSuggestionFE,
  canSuggestNewUserFE,
  canDeleteComment,
} from "~/permissions";
import styles from "~/styles/plus.css";
import { databaseTimestampToDate } from "~/utils/dates";
import {
  makeTitle,
  parseRequestFormData,
  requireUser,
  validate,
} from "~/utils/remix";
import { discordFullName } from "~/utils/strings";
import { actualNumber } from "~/utils/zod";

export const links: LinksFunction = () => {
  return [{ rel: "stylesheet", href: styles }];
};

export const meta: MetaFunction = () => {
  return {
    title: makeTitle("Plus Server suggestions"),
    description: "This month's suggestions for +1, +2 and +3.",
  };
};

const suggestionActionSchema = z.object({
  suggestionId: z.preprocess(actualNumber, z.number()),
});

export const action: ActionFunction = async ({ request }) => {
  const data = await parseRequestFormData({
    request,
    schema: suggestionActionSchema,
  });
  const user = await requireUser(request);

  const suggestions = db.plusSuggestions.findVisibleForUser({
    ...upcomingVoting(new Date()),
    plusTier: user.plusTier,
  });

  const targetSuggestion = suggestions
    ? Object.values(suggestions)
        ?.flat()
        .flatMap((u) => u.suggestions)
        .find((s) => s.id === data.suggestionId)
    : undefined;

  validate(suggestions);
  validate(targetSuggestion);
  validate(
    canDeleteComment({
      user,
      author: targetSuggestion.author,
      suggestionId: data.suggestionId,
      suggestions,
    })
  );

  db.plusSuggestions.del(data.suggestionId);

  return null;
};

export interface PlusSuggestionsLoaderData {
  suggestions?: plusSuggestions.FindVisibleForUser;
  suggestedForTiers: number[];
}

export const loader: LoaderFunction = async ({ request }) => {
  const user = await requireUser(request);

  return json<PlusSuggestionsLoaderData>({
    suggestions: db.plusSuggestions.findVisibleForUser({
      ...upcomingVoting(new Date()),
      plusTier: user.plusTier,
    }),
    suggestedForTiers: db.plusSuggestions.tiersSuggestedFor({
      ...upcomingVoting(new Date()),
      userId: user.id,
    }),
  });
};

export default function PlusSuggestionsPage() {
  const data = useLoaderData<PlusSuggestionsLoaderData>();
  const user = useUser();
  const [tierVisible, setTierVisible] = React.useState(
    tierVisibleInitialState(data.suggestions)
  );

  if (!data.suggestions) {
    return <SuggestedForInfo />;
  }

  invariant(tierVisible);
  const visibleSuggestions = data.suggestions[tierVisible];
  invariant(visibleSuggestions);

  return (
    <>
      <Outlet />
      <div className="plus__container">
        <SuggestedForInfo />
        <div className="stack lg">
          <div
            className={clsx("plus__top-container", {
              "content-centered": !canSuggestNewUserFE({
                user,
                suggestions: data.suggestions,
              }),
            })}
          >
            <div className="plus__radios">
              {Object.entries(data.suggestions)
                .sort((a, b) => Number(a[0]) - Number(b[0]))
                .map(([tier, suggestions]) => {
                  const id = String(tier);
                  return (
                    <div key={id} className="plus__radio-container">
                      <label htmlFor={id} className="plus__radio-label">
                        +{tier}{" "}
                        <span className="plus__users-count">
                          ({suggestions.length})
                        </span>
                      </label>
                      <input
                        id={id}
                        name="tier"
                        type="radio"
                        checked={tierVisible === tier}
                        onChange={() => setTierVisible(tier)}
                        data-cy={`plus${tier}-radio`}
                      />
                    </div>
                  );
                })}
            </div>
            {canSuggestNewUserFE({ user, suggestions: data.suggestions }) ? (
              // TODO: resetScroll={false} https://twitter.com/ryanflorence/status/1527775882797907969
              <LinkButton to="new">Suggest</LinkButton>
            ) : null}
          </div>
          <div className="stack lg">
            {visibleSuggestions.map((u) => (
              <SuggestedUser
                key={`${u.suggestedUser.id}-${tierVisible}`}
                suggested={u}
                tier={tierVisible}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function tierVisibleInitialState(
  suggestions?: plusSuggestions.FindVisibleForUser
) {
  if (!suggestions) return;
  return String(Math.min(...Object.keys(suggestions).map(Number)));
}

function SuggestedForInfo() {
  const data = useLoaderData<PlusSuggestionsLoaderData>();
  const user = useUser();

  // no need to show anything if they can't be suggested anyway...
  if (user?.plusTier === 1) {
    return null;
  }

  if (data.suggestedForTiers.length === 0) {
    return (
      <div className="plus__suggested-info-text">
        You are not suggested yet this month.
      </div>
    );
  }

  return (
    <div className="plus__suggested-info-text">
      You are suggested for{" "}
      {data.suggestedForTiers.map((tier) => `+${tier}`).join(" and ")} this
      month.
    </div>
  );
}

function SuggestedUser({
  suggested,
  tier,
}: {
  suggested: plusSuggestions.FindVisibleForUserSuggestedUserInfo;
  tier: string;
}) {
  const data = useLoaderData<PlusSuggestionsLoaderData>();
  const user = useUser();

  invariant(data.suggestions);

  return (
    <div className="stack md">
      <div className="plus__suggested-user-info">
        <Avatar
          discordAvatar={suggested.suggestedUser.discordAvatar}
          discordId={suggested.suggestedUser.discordId}
          size="md"
        />
        <h2>Buckinghamshire</h2>
        {canAddCommentToSuggestionFE({
          user,
          suggestions: data.suggestions,
          suggested: { id: suggested.suggestedUser.id },
          targetPlusTier: Number(tier),
        }) ? (
          // TODO: resetScroll={false} https://twitter.com/ryanflorence/status/1527775882797907969
          <LinkButton
            className="plus__comment-button"
            tiny
            variant="outlined"
            to={`comment/${tier}/${suggested.suggestedUser.id}`}
            data-cy="comment-button"
          >
            Comment
          </LinkButton>
        ) : null}
      </div>
      <details>
        <summary
          className="plus__view-comments-action"
          data-cy="comments-summary"
        >
          Comments ({suggested.suggestions.length})
        </summary>
        <div className="stack sm mt-2">
          {suggested.suggestions.map((suggestion) => {
            invariant(data.suggestions);
            return (
              <fieldset key={suggestion.id} className="plus__comment">
                <legend>{discordFullName(suggestion.author)}</legend>
                {suggestion.text}
                <div className="stack vertical xs items-center">
                  <span className="plus__comment-time">
                    <time>
                      {databaseTimestampToDate(
                        suggestion.createdAt
                      ).toLocaleString()}
                    </time>
                  </span>
                  {canDeleteComment({
                    author: suggestion.author,
                    user,
                    suggestionId: suggestion.id,
                    suggestions: data.suggestions,
                  }) ? (
                    <CommentDeleteButton
                      suggestionId={suggestion.id}
                      tier={tier}
                      suggestedDiscordName={suggested.suggestedUser.discordName}
                    />
                  ) : null}
                </div>
              </fieldset>
            );
          })}
        </div>
      </details>
    </div>
  );
}

function CommentDeleteButton({
  suggestionId,
  tier,
  suggestedDiscordName,
}: {
  suggestionId: PlusSuggestion["id"];
  tier: string;
  suggestedDiscordName: string;
}) {
  return (
    <FormWithConfirm
      fields={[["suggestionId", suggestionId]]}
      // TODO: Delete your suggestion of suggestedDiscordName and 3 comments to it? + different behavior of the delete event
      dialogHeading={`Delete your comment to ${suggestedDiscordName}'s +${tier} suggestion?`}
    >
      <Button
        className="plus__delete-button"
        icon={<TrashIcon />}
        variant="minimal-destructive"
        aria-label="Delete comment"
        data-cy="delete-comment-button"
      />
    </FormWithConfirm>
  );
}

export const CatchBoundary = Catcher;