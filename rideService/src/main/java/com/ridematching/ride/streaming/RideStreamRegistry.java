package com.ridematching.ride.streaming;

import com.ridematching.ride.dto.RideResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Backs the "push instead of poll" fix from the Dispatch Internals write-up: the frontend
 * used to re-fetch a ride's status every 1.5s regardless of whether anything changed. This
 * keeps one SSE connection per actively-watched ride and pushes the moment something
 * actually happens — an HTTP action (arrive/start/complete/cancel) or a Kafka-driven change
 * (driver.assigned, fare.calculated) — instead of the client finding out on its next poll tick.
 */
@Slf4j
@Component
public class RideStreamRegistry {

    private static final long TIMEOUT_MS = 15 * 60 * 1000L; // generous — a stalled trip shouldn't drop the stream

    private final Map<UUID, List<SseEmitter>> emitters = new ConcurrentHashMap<>();

    public SseEmitter subscribe(UUID rideId) {

        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);

        emitters.computeIfAbsent(rideId, k -> new CopyOnWriteArrayList<>()).add(emitter);

        emitter.onCompletion(() -> remove(rideId, emitter));
        emitter.onTimeout(() -> remove(rideId, emitter));
        emitter.onError(e -> remove(rideId, emitter));

        return emitter;
    }

    public void publish(UUID rideId, RideResponse ride) {

        List<SseEmitter> subscribers = emitters.get(rideId);

        if (subscribers == null || subscribers.isEmpty()) {
            return;
        }

        for (SseEmitter emitter : subscribers) {
            try {
                emitter.send(SseEmitter.event().name("ride").data(ride));
            } catch (IOException | IllegalStateException e) {
                remove(rideId, emitter);
            }
        }
    }

    private void remove(UUID rideId, SseEmitter emitter) {

        emitters.computeIfPresent(rideId, (id, list) -> {
            list.remove(emitter);
            return list.isEmpty() ? null : list;
        });
    }

}
