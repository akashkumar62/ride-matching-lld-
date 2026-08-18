package com.ridematching.ride.repository;

import com.ridematching.common.enums.RideStatus;
import com.ridematching.ride.entity.Ride;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface RideRepository extends JpaRepository<Ride, UUID> {

    List<Ride> findByRiderEmailOrderByCreatedAtDesc(String riderEmail);

    List<Ride> findByStatusAndCreatedAtBefore(RideStatus status, LocalDateTime cutoff);

    /** IDs about to be reaped by cancelStaleSearches — read before the bulk UPDATE so the
     *  reaper can push a stream update to anyone watching a ride that's about to disappear. */
    @Query("SELECT r.id FROM Ride r WHERE r.status = 'REQUESTED' AND (r.searchingSince IS NULL OR r.searchingSince < :cutoff)")
    List<UUID> findStaleSearchIds(@Param("cutoff") LocalDateTime cutoff);

    @Transactional
    @Modifying
    @Query("UPDATE Ride r SET r.driverEmail = :driverEmail, r.status = 'DRIVER_ASSIGNED' " +
            "WHERE r.id = :id AND r.status = 'REQUESTED'")
    int acceptIfAvailable(@Param("id") UUID id, @Param("driverEmail") String driverEmail);

    @Transactional
    @Modifying
    @Query("UPDATE Ride r SET r.driverEmail = NULL, r.status = 'REQUESTED', r.searchingSince = CURRENT_TIMESTAMP " +
            "WHERE r.id = :id AND r.driverEmail = :driverEmail " +
            "AND r.status IN ('DRIVER_ASSIGNED', 'DRIVER_ARRIVED')")
    int driverCancelIfAssigned(@Param("id") UUID id, @Param("driverEmail") String driverEmail);

    @Transactional
    @Modifying
    @Query("UPDATE Ride r SET r.fare = :fare WHERE r.id = :id")
    int applyFare(@Param("id") UUID id, @Param("fare") Double fare);

    /**
     * Gives up on rides that have been actively searching for a driver too long, instead of
     * retrying forever. Existing rows from before this column existed have a null
     * searchingSince — treated as "old enough to reap" rather than silently never matching
     * the cutoff comparison.
     */
    @Transactional
    @Modifying
    @Query("UPDATE Ride r SET r.status = 'CANCELLED' " +
            "WHERE r.status = 'REQUESTED' AND (r.searchingSince IS NULL OR r.searchingSince < :cutoff)")
    int cancelStaleSearches(@Param("cutoff") LocalDateTime cutoff);

}
