package com.ridematching.location.service;

import com.ridematching.common.constants.RedisKeys;
import com.ridematching.common.dto.LocationDto;
import com.ridematching.location.dto.AllDriversLocationResponse;
import com.ridematching.location.dto.DriverLocationResponse;
import com.ridematching.location.dto.NearbyDriverResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.geo.*;
import org.springframework.data.redis.connection.RedisGeoCommands;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Service
public class LocationService {

    private final StringRedisTemplate redisTemplate;
    private final long presenceTtlSeconds;

    public LocationService(StringRedisTemplate redisTemplate,
                            @Value("${location.presence.ttl-seconds}") long presenceTtlSeconds) {
        this.redisTemplate = redisTemplate;
        this.presenceTtlSeconds = presenceTtlSeconds;
    }

    public DriverLocationResponse updateLocation(String email, LocationDto location) {

        redisTemplate.opsForGeo().add(
                RedisKeys.DRIVER_LOCATION,
                new Point(location.longitude(), location.latitude()),
                email);

        markPresent(email);

        return new DriverLocationResponse(email, location.latitude(), location.longitude());
    }

    public void removeLocation(String email) {

        redisTemplate.opsForGeo().remove(RedisKeys.DRIVER_LOCATION, email);

        redisTemplate.delete(lastSeenKey(email));
    }

    public DriverLocationResponse findOne(String email) {

        if (!isFresh(email)) {
            throw new RuntimeException("Location not found");
        }

        List<Point> points = redisTemplate.opsForGeo().position(RedisKeys.DRIVER_LOCATION, email);

        if (points == null || points.isEmpty() || points.get(0) == null) {
            throw new RuntimeException("Location not found");
        }

        Point point = points.get(0);

        return new DriverLocationResponse(email, point.getY(), point.getX());
    }

    public List<NearbyDriverResponse> findNearby(double latitude, double longitude,
                                                  double radiusKm, int limit) {

        Circle within = new Circle(
                new Point(longitude, latitude),
                new Distance(radiusKm, Metrics.KILOMETERS));

        RedisGeoCommands.GeoRadiusCommandArgs args = RedisGeoCommands.GeoRadiusCommandArgs
                .newGeoRadiusArgs()
                .includeCoordinates()
                .includeDistance()
                .sortAscending()
                .limit(limit);

        GeoResults<RedisGeoCommands.GeoLocation<String>> results =
                redisTemplate.opsForGeo().radius(RedisKeys.DRIVER_LOCATION, within, args);

        if (results == null) {
            return List.of();
        }

        return results.getContent().stream()
                .filter(result -> isFresh(result.getContent().getName()))
                .map(result -> {
                    RedisGeoCommands.GeoLocation<String> location = result.getContent();
                    Point point = location.getPoint();

                    return new NearbyDriverResponse(
                            location.getName(),
                            point.getY(),
                            point.getX(),
                            result.getDistance().getValue());
                })
                .toList();
    }

    /** Every currently-fresh driver's position in one round trip — for fleet-wide visualization, not nearest-driver search. */
    public List<AllDriversLocationResponse> findAll() {

        Set<String> members = redisTemplate.opsForZSet().range(RedisKeys.DRIVER_LOCATION, 0, -1);

        if (members == null || members.isEmpty()) {
            return List.of();
        }

        List<String> freshMembers = members.stream().filter(this::isFresh).toList();

        if (freshMembers.isEmpty()) {
            return List.of();
        }

        List<Point> points = redisTemplate.opsForGeo()
                .position(RedisKeys.DRIVER_LOCATION, freshMembers.toArray(new String[0]));

        if (points == null) {
            return List.of();
        }

        List<AllDriversLocationResponse> result = new ArrayList<>();

        for (int i = 0; i < freshMembers.size(); i++) {
            Point point = points.get(i);
            if (point != null) {
                result.add(new AllDriversLocationResponse(freshMembers.get(i), point.getY(), point.getX()));
            }
        }

        return result;
    }

    private void markPresent(String email) {
        redisTemplate.opsForValue().set(
                lastSeenKey(email),
                Instant.now().toString(),
                Duration.ofSeconds(presenceTtlSeconds));
    }

    private boolean isFresh(String email) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(lastSeenKey(email)));
    }

    private String lastSeenKey(String email) {
        return RedisKeys.DRIVER_LAST_SEEN + ":" + email;
    }

}
